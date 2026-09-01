/**
 * B5 checks — confirm + QR issuance.
 *
 *   Part 1 · QR payload shape and PNG encoding — no DB, no server, always runs.
 *   Part 2 · HTTP, RBAC, state machine, email:
 *
 *       bun run db:up
 *       bun run dev:test        # terminal 1 — server on the test database
 *       bun run test:api:b5     # terminal 2
 *
 * Named `.check.ts`, not `.test.ts`, for the same reason as a7/b4: it is a
 * standalone script that TRUNCATEs real tables, and a plain `bun test` sweeping
 * it up would wipe whatever DATABASE_URL points at.
 */

process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5433/placeholder";
process.env.BETTER_AUTH_SECRET ||= "x".repeat(32);
process.env.INGEST_API_KEY ||= "placeholder-key";

const { qrPayload, qrPng, qrDataUrl } = await import("../src/lib/qr.ts");
const { QR_PREFIX } = await import("../src/contracts/scan.ts");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL"}  ${label}${cond ? "" : "   " + extra}`);
  cond ? pass++ : fail++;
};

// ─────────────────────────────────────────────────────────────────────
// Part 1 · payload + encoding
// ─────────────────────────────────────────────────────────────────────
console.log("\n── QR payload ──");
const TOKEN = "abcdef0123456789abcdef0123456789abcdef01";
check("payload is exactly RENT:v1:<token>", qrPayload(TOKEN) === `RENT:v1:${TOKEN}`, qrPayload(TOKEN));
check("prefix comes from the scan contract, not a copy", qrPayload(TOKEN).startsWith(QR_PREFIX));
check("payload carries no PII / JSON / booking id", !/[{}@]/.test(qrPayload(TOKEN)));
/**
 * The scan contract strips the prefix to recover the token. Round-tripping here
 * means the writer and the reader cannot drift — the failure mode otherwise is
 * a QR that scans fine and then resolves to nothing.
 */
const { QrToken } = await import("../src/contracts/scan.ts");
check("scan contract parses our payload back to the token", QrToken.parse(qrPayload(TOKEN)) === TOKEN);
check("scan contract also accepts a bare token (manual entry)", QrToken.parse(TOKEN) === TOKEN);

console.log("\n── PNG encoding ──");
const png = await qrPng(TOKEN);
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
check("qrPng returns real PNG bytes", png.subarray(0, 8).equals(MAGIC), png.subarray(0, 8).toString("hex"));
check("PNG is a plausible size (>500B)", png.length > 500, `${png.length}B`);
const dataUrl = await qrDataUrl(TOKEN);
check("qrDataUrl is a base64 png data URI", dataUrl.startsWith("data:image/png;base64,"));

// ─────────────────────────────────────────────────────────────────────
// Part 2 · HTTP
// ─────────────────────────────────────────────────────────────────────
const API = process.env.API_URL ?? "http://localhost:4000";
const ORIGIN = "http://localhost:3000";

const reachable = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log("\n── HTTP checks SKIPPED — API not reachable at " + API + " ──");
  console.log("   bun run db:up && bun run dev:test\n");
  console.log(`${pass} passed, ${fail} failed  (Part 1 only)`);
  process.exit(fail === 0 ? 0 : 1);
}

{
  const raw = process.env.DATABASE_URL ?? "";
  const host = raw ? new URL(raw).hostname : "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE_TRUNCATE !== "1") {
    console.error(`\n✘ REFUSING TO RUN — this suite TRUNCATEs, and DATABASE_URL points at "${host}".`);
    console.error("  Use: bun run dev:test  +  bun run test:api:b5");
    console.error("  Set ALLOW_REMOTE_TRUNCATE=1 only if you genuinely mean to wipe a remote DB.\n");
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
    const ct = res.headers.get("content-type") ?? "";
    const body = ct.includes("json") ? await res.json().catch(() => null) : null;
    const bytes = ct.includes("image") ? new Uint8Array(await res.arrayBuffer()) : null;
    return { status: res.status, body, bytes, ct } as any;
  };
};

await prisma.$executeRawUnsafe(
  'TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking","Notification" CASCADE;',
);

const admin = mkClient(), client = mkClient(), other = mkClient();
const signUp = (cl: any, email: string, name: string) =>
  cl("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email, password: "password123", name }) });

await signUp(admin, "admin@rental.com", "Admin");
await prisma.user.update({ where: { email: "admin@rental.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "admin@rental.com", password: "password123" }) });
await signUp(client, "c1@b.com", "Client One");
await signUp(other, "c2@b.com", "Client Two");

const eq = await admin("/api/equipment", { method: "POST", body: JSON.stringify({
  code: "EXC-5001", name: "Excavator 5001", type: "EXCAVATOR", dailyRate: 500, homeLat: 27.7, homeLng: 85.3 }) });
const eqId = eq.body?.data?.id;

const book = (from: string, to: string) => client("/api/bookings", { method: "POST", body: JSON.stringify({
  equipmentId: eqId, startDate: `${from}T00:00:00Z`, endDate: `${to}T00:00:00Z` }) });

console.log("\n── POST /:id/confirm ──");
let r = await book("2027-04-01", "2027-04-10");
const id = r.body?.data?.id;
const tokenBefore = (await prisma.booking.findUniqueOrThrow({ where: { id } })).qrToken;

r = await client(`/api/bookings/${id}/confirm`, { method: "POST" });
check("CLIENT cannot confirm → 403", r.status === 403, `got ${r.status}`);

r = await admin(`/api/bookings/${id}/confirm`, { method: "POST" });
check("ADMIN confirms → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  status is CONFIRMED", r.body?.data?.status === "CONFIRMED", r.body?.data?.status);
check("  qrDataUrl returned inline", String(r.body?.data?.qrDataUrl ?? "").startsWith("data:image/png;base64,"));
check("  raw qrToken NOT in the response", r.body?.data?.qrToken === undefined);

const after = await prisma.booking.findUniqueOrThrow({ where: { id } });
check("qrToken ROTATED at confirm", after.qrToken !== tokenBefore);
check("  rotated token is 32 bytes base64url", after.qrToken.length >= 43 && !/[+/=]/.test(after.qrToken), after.qrToken.slice(0, 12));
check("  qrIssuedAt moved to confirm time", after.qrIssuedAt.getTime() >= after.createdAt.getTime());

console.log("\n── email side effect (D4 mailer) ──");
const notif = await prisma.notification.findFirst({ where: { type: "BOOKING_CONFIRMED" } });
check("a Notification row was written", notif !== null);
check("  type is BOOKING_CONFIRMED", notif?.type === "BOOKING_CONFIRMED", String(notif?.type));
check("  status is SENT", notif?.status === "SENT", `${notif?.status} ${notif?.error ?? ""}`);
check("  dedupeKey is scoped to the booking", notif?.dedupeKey === `BOOKING_CONFIRMED:${id}:confirm`, String(notif?.dedupeKey));
check("  response reported emailed:true", r.body?.data?.emailed === true, JSON.stringify(r.body?.data?.emailError));

console.log("\n── confirm is not repeatable ──");
r = await admin(`/api/bookings/${id}/confirm`, { method: "POST" });
check("confirming twice → 409", r.status === 409, `got ${r.status}`);
const tokenStill = (await prisma.booking.findUniqueOrThrow({ where: { id } })).qrToken;
check("  second confirm did NOT rotate the token again", tokenStill === after.qrToken);

const cancelled = await book("2027-05-01", "2027-05-10");
await client(`/api/bookings/${cancelled.body?.data?.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
r = await admin(`/api/bookings/${cancelled.body?.data?.id}/confirm`, { method: "POST" });
check("confirming a CANCELLED booking → 409", r.status === 409, `got ${r.status}`);

console.log("\n── GET /:id/qr.png ──");
r = await client(`/api/bookings/${id}/qr.png`);
check("owner gets the PNG → 200", r.status === 200, `got ${r.status}`);
check("  content-type is image/png", r.ct.includes("image/png"), r.ct);
check("  body is real PNG bytes", r.bytes !== null && Buffer.from(r.bytes.slice(0, 8)).equals(MAGIC));
r = await admin(`/api/bookings/${id}/qr.png`);
check("admin gets the PNG → 200", r.status === 200, `got ${r.status}`);
r = await other(`/api/bookings/${id}/qr.png`);
check("another client → 403", r.status === 403, `got ${r.status}`);

const pending = await book("2027-06-01", "2027-06-10");
r = await client(`/api/bookings/${pending.body?.data?.id}/qr.png`);
check("PENDING booking has no QR yet → 409", r.status === 409, `got ${r.status}`);
r = await client(`/api/bookings/${cancelled.body?.data?.id}/qr.png`);
check("CANCELLED booking's QR is refused → 409", r.status === 409, `got ${r.status}`);

console.log("\n── the QR encodes the CURRENT token ──");
const expected = await qrPng(after.qrToken);
const served = await client(`/api/bookings/${id}/qr.png`);
check("served PNG matches a fresh encode of the stored token",
  Buffer.from(served.bytes).equals(expected), `${served.bytes?.length}B vs ${expected.length}B`);

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
