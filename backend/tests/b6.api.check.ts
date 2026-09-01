/**
 * B6 checks — the scan state machine (steps.md §5).
 *
 *       bun run db:up
 *       bun run dev:test        # terminal 1
 *       bun run test:api:b6     # terminal 2
 *
 * Named `.check.ts` for the same reason as a7/b4/b5: it TRUNCATEs real tables.
 *
 * The table below IS the spec. If you change which status maps to which action,
 * these are what tell you what you broke.
 */

process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5433/placeholder";
process.env.BETTER_AUTH_SECRET ||= "x".repeat(32);
process.env.INGEST_API_KEY ||= "placeholder-key";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL"}  ${label}${cond ? "" : "   " + extra}`);
  cond ? pass++ : fail++;
};

const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = "http://localhost:3000";

const reachable = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log("\n── SKIPPED — API not reachable at " + API + " ──");
  console.log("   bun run db:up && bun run dev:test\n");
  process.exit(0);
}

{
  const raw = process.env.DATABASE_URL ?? "";
  const host = raw ? new URL(raw).hostname : "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE_TRUNCATE !== "1") {
    console.error(`\n✘ REFUSING TO RUN — this suite TRUNCATEs, and DATABASE_URL points at "${host}".`);
    console.error("  Use: bun run dev:test  +  bun run test:api:b6\n");
    process.exit(1);
  }
}

const { prisma } = await import("../src/db.ts");

const mkClient = () => {
  let cookie = "";
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(API + path, { ...init, headers: {
      "Content-Type": "application/json", Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) } });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(",").map((p) => p.split(";")[0]).join("; ");
    return { status: res.status, body: await res.json().catch(() => null) } as any;
  };
};

await prisma.$executeRawUnsafe(
  'TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking","CheckEvent","Notification" CASCADE;',
);

const admin = mkClient(), client = mkClient();
const signUp = (cl: any, email: string, name: string) =>
  cl("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email, password: "password123", name }) });

await signUp(admin, "admin@rental.com", "Admin");
await prisma.user.update({ where: { email: "admin@rental.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "admin@rental.com", password: "password123" }) });
await signUp(client, "c1@b.com", "Client One");

let eqSeq = 0;
const mkEquipment = async () => {
  const r = await admin("/api/equipment", { method: "POST", body: JSON.stringify({
    code: `SCN-${++eqSeq}`, name: `Scan ${eqSeq}`, type: "EXCAVATOR", dailyRate: 300, homeLat: 27.7, homeLng: 85.3 }) });
  return r.body?.data?.id;
};

/** Booking + its live qrToken, at whatever status the test needs. */
const mkBooking = async (opts: { confirm?: boolean } = {}) => {
  const eqId = await mkEquipment();
  const r = await client("/api/bookings", { method: "POST", body: JSON.stringify({
    equipmentId: eqId, startDate: "2027-08-01T00:00:00Z", endDate: "2027-08-10T00:00:00Z" }) });
  const id = r.body?.data?.id;
  if (opts.confirm) await admin(`/api/bookings/${id}/confirm`, { method: "POST" });
  const row = await prisma.booking.findUniqueOrThrow({ where: { id } });
  return { id, eqId, token: row.qrToken };
};

const resolve = (cl: any, token: string) => cl("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token }) });
const commit = (cl: any, token: string, extra: object = {}) =>
  cl("/api/scan/commit", { method: "POST", body: JSON.stringify({ token, ...extra }) });

console.log("\n── RBAC ──");
const confirmed = await mkBooking({ confirm: true });
let r = await resolve(client, confirmed.token);
check("CLIENT cannot resolve a scan → 403", r.status === 403, `got ${r.status}`);
r = await commit(client, confirmed.token);
check("CLIENT cannot commit a scan → 403", r.status === 403, `got ${r.status}`);

console.log("\n── resolve accepts the QR payload and the bare token ──");
r = await resolve(admin, `RENT:v1:${confirmed.token}`);
check("full RENT:v1:<token> payload resolves → 200", r.status === 200, `got ${r.status}`);
check("  action is CHECK_OUT", r.body?.data?.action === "CHECK_OUT", r.body?.data?.action);
check("  preview carries client name", r.body?.data?.booking?.client?.name === "Client One");
check("  preview carries equipment code", typeof r.body?.data?.booking?.equipment?.code === "string");
check("  preview does NOT leak qrToken", r.body?.data?.booking?.qrToken === undefined);
r = await resolve(admin, confirmed.token);
check("bare token (manual entry) resolves too → 200", r.status === 200, `got ${r.status}`);
r = await resolve(admin, "not-a-real-token-at-all");
check("unknown token → 404", r.status === 404, `got ${r.status}`);
check("resolve wrote nothing", (await prisma.checkEvent.count()) === 0);

console.log("\n── §5 table: statuses that refuse ──");
const pending = await mkBooking();
r = await resolve(admin, pending.token);
check("PENDING → 409", r.status === 409, `got ${r.status}`);
check("  message says not confirmed yet", /not confirmed yet/i.test(r.body?.error?.message ?? ""), r.body?.error?.message);
r = await commit(admin, pending.token);
check("PENDING commit also refused → 409", r.status === 409, `got ${r.status}`);

const cancelled = await mkBooking();
await client(`/api/bookings/${cancelled.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
r = await resolve(admin, cancelled.token);
check("CANCELLED → 409", r.status === 409, `got ${r.status}`);
check("  message says cancelled", /cancelled/i.test(r.body?.error?.message ?? ""), r.body?.error?.message);

console.log("\n── CONFIRMED → CHECK_OUT ──");
r = await commit(admin, confirmed.token, { meterHours: 1200.5, fuelPct: 88, conditionNotes: "minor scratch", lat: 27.7, lng: 85.3 });
check("commit → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  action CHECK_OUT", r.body?.data?.action === "CHECK_OUT", r.body?.data?.action);
check("  booking is CHECKED_OUT", r.body?.data?.booking?.status === "CHECKED_OUT");
let row = await prisma.booking.findUniqueOrThrow({ where: { id: confirmed.id } });
check("  checkoutAt set", row.checkoutAt !== null);
check("  checkinAt still null", row.checkinAt === null);
let eq = await prisma.equipment.findUniqueOrThrow({ where: { id: confirmed.eqId } });
check("  equipment → CHECKED_OUT", eq.status === "CHECKED_OUT", eq.status);
let ev = await prisma.checkEvent.findFirstOrThrow({ where: { bookingId: confirmed.id, type: "CHECK_OUT" } });
check("  CheckEvent recorded meter/fuel/notes", ev.meterHours === 1200.5 && ev.fuelPct === 88 && ev.conditionNotes === "minor scratch");
check("  CheckEvent records who scanned", typeof ev.scannedById === "string" && ev.scannedById.length > 0);
check("  checkout receipt sent", (await prisma.notification.count({ where: { type: "CHECKOUT_RECEIPT" } })) === 1);

console.log("\n── the SAME token now means CHECK_IN ──");
r = await resolve(admin, confirmed.token);
check("same token resolves to CHECK_IN", r.body?.data?.action === "CHECK_IN", r.body?.data?.action);
check("  lastCheckout prefill returned", r.body?.data?.lastCheckout?.meterHours === 1200.5, JSON.stringify(r.body?.data?.lastCheckout));

console.log("\n── the client never picks the action ──");
r = await commit(admin, confirmed.token, { action: "CHECK_OUT" });
check("stale scanner asking CHECK_OUT again → 409", r.status === 409, `got ${r.status}`);
check("  message names the expected action", /CHECK_IN/.test(r.body?.error?.message ?? ""), r.body?.error?.message);

console.log("\n── the rescan cooldown blocks an instant flip ──");
r = await commit(admin, confirmed.token, { meterHours: 1210.5 });
check("checking in seconds after check-out → 409", r.status === 409, `got ${r.status}`);
check("  message explains the machine just left the yard", /just left the yard/i.test(r.body?.error?.message ?? ""), r.body?.error?.message);
check("  booking still CHECKED_OUT", (await prisma.booking.findUniqueOrThrow({ where: { id: confirmed.id } })).status === "CHECKED_OUT");

console.log("\n── CHECKED_OUT → CHECK_IN (a real return, later) ──");
// Backdate the check-out event past the cooldown rather than sleeping for it.
// Billing reads booking.checkoutAt, not the event, so this only ages the guard.
await prisma.checkEvent.updateMany({
  where: { bookingId: confirmed.id, type: "CHECK_OUT" },
  data: { at: new Date(Date.now() - 60_000) },
});
r = await commit(admin, confirmed.token, { meterHours: 1210.5, fuelPct: 40 });
check("commit → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  action CHECK_IN", r.body?.data?.action === "CHECK_IN");
check("  booking is RETURNED", r.body?.data?.booking?.status === "RETURNED");
row = await prisma.booking.findUniqueOrThrow({ where: { id: confirmed.id } });
check("  checkinAt set", row.checkinAt !== null);
check("  totalAmount computed", row.totalAmount !== null, String(row.totalAmount));
check("  totalAmount = dailyRate × billable days", Number(row.totalAmount) === 300 * r.body?.data?.billableDays, `${row.totalAmount} vs 300×${r.body?.data?.billableDays}`);
check("  engine hours = checkin meter − checkout meter", r.body?.data?.totalEngineHours === 10, String(r.body?.data?.totalEngineHours));
eq = await prisma.equipment.findUniqueOrThrow({ where: { id: confirmed.eqId } });
check("  equipment → AVAILABLE", eq.status === "AVAILABLE", eq.status);
check("  check-in receipt sent", (await prisma.notification.count({ where: { type: "CHECKIN_RECEIPT" } })) === 1);

console.log("\n── a used QR is spent ──");
r = await resolve(admin, confirmed.token);
check("RETURNED → 409", r.status === 409, `got ${r.status}`);
check("  message says already used", /already been used/i.test(r.body?.error?.message ?? ""), r.body?.error?.message);
r = await commit(admin, confirmed.token);
check("  commit refused too → 409", r.status === 409, `got ${r.status}`);

console.log("\n── double-tap cannot double-fire ──");
const race = await mkBooking({ confirm: true });
const fired = await Promise.all([
  commit(admin, race.token, { meterHours: 10 }),
  commit(admin, race.token, { meterHours: 10 }),
  commit(admin, race.token, { meterHours: 10 }),
  commit(admin, race.token, { meterHours: 10 }),
]);
const won = fired.filter((x) => x.status === 200).length;
check("exactly ONE of 4 concurrent commits wins", won === 1, `${won} won: ${fired.map((x) => x.status).join(",")}`);
check("  no commit slipped through as a CHECK_IN", fired.every((x) => x.status !== 200 || x.body?.data?.action === "CHECK_OUT"), fired.map((x) => x.body?.data?.action).join(","));
check("  exactly one CheckEvent written", (await prisma.checkEvent.count({ where: { bookingId: race.id } })) === 1);
const raceRow = await prisma.booking.findUniqueOrThrow({ where: { id: race.id } });
check("  booking is CHECKED_OUT, not double-advanced", raceRow.status === "CHECKED_OUT", raceRow.status);

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
