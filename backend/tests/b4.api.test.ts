/**
 * B4 tests — booking creation, the date-overlap rule, and role scoping.
 *
 *   Part 1 · overlap boundary rules   — no DB, no server, always runs.
 *   Part 2 · HTTP + RBAC + persistence — needs the API and Postgres:
 *
 *       Terminal 1:  bun run db:up && bun run db:push && bun run dev
 *       Terminal 2:  bun tests/b4.api.test.ts
 *
 *   Part 2 skips itself with instructions if the API is not reachable, so this
 *   file is useful before Postgres is running and complete once it is.
 *
 * ⚠️  Part 2 is DESTRUCTIVE: it truncates users, equipment, sites, operators
 * and bookings. Local dev database only.
 *
 * The boundary cases in Part 1 mirror the availability cases in a7.api.test.ts
 * on purpose. The catalogue filter and this endpoint must agree on what
 * "overlaps" means, or the UI offers a machine that POST /api/bookings refuses.
 */

// env.ts process.exit(1)s on missing vars. These are placeholders so the module
// graph can be imported without a real database — Prisma does not connect until
// the first query, so Part 1 stays offline.
process.env.DATABASE_URL ||= "postgresql://u:p@localhost:5433/placeholder";
process.env.BETTER_AUTH_SECRET ||= "x".repeat(32);
process.env.INGEST_API_KEY ||= "placeholder-key";

const { overlapWhere, BLOCKING_STATUSES } = await import("../src/routes/bookings.ts");

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL"}  ${label}${cond ? "" : "   " + extra}`);
  cond ? pass++ : fail++;
};

const D = (s: string) => new Date(`${s}T00:00:00Z`);

// ─────────────────────────────────────────────────────────────────────
// Part 1 · the overlap predicate
// ─────────────────────────────────────────────────────────────────────
/**
 * A faithful mini-interpreter of the Prisma filter `overlapWhere` builds.
 * It reads the comparison operators generically rather than reimplementing the
 * rule, so flipping `lte` to `lt` in the route makes the boundary cases below
 * fail instead of silently passing.
 */
type Cmp = { lte?: Date; lt?: Date; gte?: Date; gt?: Date };
const satisfies = (value: Date, f: Cmp): boolean =>
  (f.lte === undefined || value <= f.lte) &&
  (f.lt === undefined || value < f.lt) &&
  (f.gte === undefined || value >= f.gte) &&
  (f.gt === undefined || value > f.gt);

type Row = { id: string; equipmentId: string; status: string; startDate: Date; endDate: Date };
const matches = (row: Row, where: any): boolean => {
  if (where.equipmentId !== row.equipmentId) return false;
  if (!where.status.in.includes(row.status)) return false;
  if (!satisfies(row.startDate, where.startDate)) return false;
  if (!satisfies(row.endDate, where.endDate)) return false;
  if (where.id?.not !== undefined && row.id === where.id.not) return false;
  return true;
};

// The machine is booked 10th → 20th September.
const existing: Row = {
  id: "bk-existing",
  equipmentId: "eq1",
  status: "CONFIRMED",
  startDate: D("2026-09-10"),
  endDate: D("2026-09-20"),
};
const collides = (from: string, to: string, exclude?: string) =>
  matches(existing, overlapWhere("eq1", D(from), D(to), exclude));

console.log("\n── overlap: a booking exists 10 Sep → 20 Sep ──");
check("window fully inside booking → collides", collides("2026-09-12", "2026-09-15"));
check("window straddling booking start → collides", collides("2026-09-05", "2026-09-12"));
check("window straddling booking end → collides", collides("2026-09-18", "2026-09-25"));
check("window enclosing booking → collides", collides("2026-09-01", "2026-09-30"));
check("identical window → collides", collides("2026-09-10", "2026-09-20"));

console.log("\n── overlap: the boundaries (inclusive, per a7.api.test.ts) ──");
check("BOUNDARY: request starts on booking END date → collides", collides("2026-09-20", "2026-09-25"));
check("BOUNDARY: request ends on booking START date → collides", collides("2026-09-05", "2026-09-10"));
check("clear of the booking, before → free", !collides("2026-09-01", "2026-09-09"));
check("clear of the booking, after → free", !collides("2026-09-21", "2026-09-30"));

console.log("\n── overlap: which statuses actually block ──");
const withStatus = (status: string) =>
  matches({ ...existing, status }, overlapWhere("eq1", D("2026-09-12"), D("2026-09-15")));
check("PENDING blocks", withStatus("PENDING"));
check("CONFIRMED blocks", withStatus("CONFIRMED"));
check("CHECKED_OUT blocks", withStatus("CHECKED_OUT"));
check("CANCELLED does NOT block — it never happened", !withStatus("CANCELLED"));
check("RETURNED does NOT block — the machine is back", !withStatus("RETURNED"));
check("blocking list matches equipment.ts", JSON.stringify(BLOCKING_STATUSES) === JSON.stringify(["PENDING", "CONFIRMED", "CHECKED_OUT"]), JSON.stringify(BLOCKING_STATUSES));

console.log("\n── overlap: other machines and self-exclusion ──");
check("a different machine never collides", !matches(existing, overlapWhere("eq2", D("2026-09-12"), D("2026-09-15"))));
check("PATCH excludes the row being edited", !collides("2026-09-12", "2026-09-15", "bk-existing"));
check("PATCH still sees OTHER bookings", collides("2026-09-12", "2026-09-15", "some-other-id"));

// ─────────────────────────────────────────────────────────────────────
// Part 2 · HTTP, RBAC, persistence
// ─────────────────────────────────────────────────────────────────────
const API = "http://localhost:4000";
const ORIGIN = "http://localhost:3000";

const reachable = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.log("\n── HTTP tests SKIPPED — API not reachable at " + API + " ──");
  console.log("   bun run db:up && bun run db:push && bun run dev\n");
  console.log(`${pass} passed, ${fail} failed  (Part 1 only)`);
  process.exit(fail === 0 ? 0 : 1);
}

const { prisma } = await import("../src/db.ts");

const mkClient = () => {
  let cookie = "";
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(API + path, {
      ...init,
      headers: { "Content-Type": "application/json", Origin: ORIGIN,
                 ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(",").map((p) => p.split(";")[0]).join("; ");
    const body = await res.json().catch(() => null);
    return { status: res.status, body } as { status: number; body: any };
  };
};

await prisma.$executeRawUnsafe(
  'TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking" CASCADE;',
);

const admin = mkClient(), client = mkClient(), other = mkClient();
const signUp = (cl: ReturnType<typeof mkClient>, email: string, name: string) =>
  cl("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email, password: "password123", name }) });

await signUp(admin, "admin@rental.com", "Admin");
await prisma.user.update({ where: { email: "admin@rental.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "admin@rental.com", password: "password123" }) });
await signUp(client, "c1@b.com", "Client One");
await signUp(other, "c2@b.com", "Client Two");
const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@b.com" } });
const c2 = await prisma.user.findUniqueOrThrow({ where: { email: "c2@b.com" } });

const eq = await admin("/api/equipment", { method: "POST", body: JSON.stringify({
  code: "EXC-9001", name: "Excavator 9001", type: "EXCAVATOR", dailyRate: 450, homeLat: 27.7, homeLng: 85.3 }) });
const eqId = eq.body?.data?.id;
const site = await admin("/api/sites", { method: "POST", body: JSON.stringify({
  name: "Site A", lat: 27.7, lng: 85.3, radiusMeters: 500 }) });
const siteId = site.body?.data?.id;

const book = (cl: ReturnType<typeof mkClient>, from: string, to: string, extra: object = {}) =>
  cl("/api/bookings", { method: "POST", body: JSON.stringify({
    equipmentId: eqId, startDate: `${from}T00:00:00Z`, endDate: `${to}T00:00:00Z`, ...extra }) });

console.log("\n── POST /api/bookings ──");
let r = await book(client, "2026-09-10", "2026-09-20");
check("client creates a booking (201)", r.status === 201, JSON.stringify(r.body));
const bookingId = r.body?.data?.id;
check("status starts PENDING", r.body?.data?.status === "PENDING", r.body?.data?.status);
check("dailyRate is a NUMBER, snapshotted from equipment", r.body?.data?.dailyRate === 450, typeof r.body?.data?.dailyRate);
check("code is generated (BK-…)", /^BK-\d{4}-\d{6}$/.test(r.body?.data?.code ?? ""), r.body?.data?.code);
check("qrToken is NOT leaked in the response", r.body?.data?.qrToken === undefined);
check("clientId is forced to the caller", r.body?.data?.clientId === c1.id);

const stored = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
check("qrToken IS persisted (schema requires it)", typeof stored.qrToken === "string" && stored.qrToken.length >= 32);

console.log("\n── overlap rejection over HTTP ──");
for (const [label, from, to] of [
  ["fully inside", "2026-09-12", "2026-09-15"],
  ["straddling start", "2026-09-05", "2026-09-12"],
  ["straddling end", "2026-09-18", "2026-09-25"],
  ["enclosing", "2026-09-01", "2026-09-30"],
  ["BOUNDARY starts on existing end", "2026-09-20", "2026-09-25"],
  ["BOUNDARY ends on existing start", "2026-09-05", "2026-09-10"],
] as const) {
  const res = await book(other, from, to);
  check(`${label} → 409`, res.status === 409, `got ${res.status}`);
  if (label === "fully inside") {
    check("  409 names the conflicting booking", typeof res.body?.error?.details?.conflictingBooking?.code === "string", JSON.stringify(res.body?.error));
    check("  409 code is CONFLICT", res.body?.error?.code === "CONFLICT", res.body?.error?.code);
  }
}
r = await book(other, "2026-09-21", "2026-09-30");
check("non-overlapping window after → 201", r.status === 201, JSON.stringify(r.body));
r = await book(other, "2026-09-01", "2026-09-09");
check("non-overlapping window before → 201", r.status === 201, JSON.stringify(r.body));

console.log("\n── a cancelled booking stops blocking ──");
const toCancel = await book(other, "2026-11-01", "2026-11-05");
await other(`/api/bookings/${toCancel.body?.data?.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
r = await book(client, "2026-11-01", "2026-11-05");
check("same window is bookable once cancelled → 201", r.status === 201, JSON.stringify(r.body));

console.log("\n── validation ──");
r = await book(client, "2026-12-10", "2026-12-01");
check("endDate before startDate → 422", r.status === 422, `got ${r.status}`);
r = await client("/api/bookings", { method: "POST", body: JSON.stringify({
  equipmentId: "does-not-exist", startDate: "2026-12-01T00:00:00Z", endDate: "2026-12-05T00:00:00Z" }) });
check("unknown equipment → 404", r.status === 404, `got ${r.status}`);
r = await book(client, "2026-12-01", "2026-12-05", { clientId: c2.id });
check("client cannot book for another client → 400", r.status === 400, `got ${r.status}`);
r = await book(admin, "2027-01-01", "2027-01-05", { clientId: c2.id });
check("ADMIN may book on behalf of a client → 201", r.status === 201, JSON.stringify(r.body));
check("  and clientId is honoured", r.body?.data?.clientId === c2.id);

console.log("\n── GET /api/bookings — role scoping ──");
const adminList = await admin("/api/bookings");
const c1List = await client("/api/bookings");
check("admin sees every booking", (adminList.body?.data?.total ?? 0) >= 6, String(adminList.body?.data?.total));
check("client sees only their own", (c1List.body?.data?.items ?? []).every((b: any) => b.clientId === c1.id));
check("client's list is smaller than admin's", (c1List.body?.data?.total ?? 0) < (adminList.body?.data?.total ?? 0));
const spoofed = await client(`/api/bookings?clientId=${c2.id}`);
check("client's ?clientId= is IGNORED, not honoured", (spoofed.body?.data?.items ?? []).every((b: any) => b.clientId === c1.id));
check("no qrToken in any list row", (adminList.body?.data?.items ?? []).every((b: any) => b.qrToken === undefined));
const filtered = await admin(`/api/bookings?clientId=${c2.id}`);
check("admin CAN filter by clientId", (filtered.body?.data?.items ?? []).every((b: any) => b.clientId === c2.id));
const byStatus = await admin("/api/bookings?status=CANCELLED");
check("status filter works", (byStatus.body?.data?.items ?? []).every((b: any) => b.status === "CANCELLED"));

console.log("\n── GET /api/bookings/:id ──");
r = await client(`/api/bookings/${bookingId}`);
check("owner can read their booking", r.status === 200, `got ${r.status}`);
check("  qrToken withheld", r.body?.data?.qrToken === undefined);
check("  isOverdue is present", typeof r.body?.data?.isOverdue === "boolean");
r = await other(`/api/bookings/${bookingId}`);
check("another client → 403", r.status === 403, `got ${r.status}`);
r = await admin(`/api/bookings/${bookingId}`);
check("admin can read any booking", r.status === 200, `got ${r.status}`);

console.log("\n── PATCH /api/bookings/:id ──");
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ siteId }) });
check("admin assigns a site", r.status === 200 && r.body?.data?.siteId === siteId, JSON.stringify(r.body?.error));
r = await client(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ siteId: null }) });
check("client cannot reassign a site → 400", r.status === 400, `got ${r.status}`);
r = await client(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ endDate: "2026-09-28T00:00:00Z" }) });
check("client cannot re-date → 400", r.status === 400, `got ${r.status}`);
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ endDate: "2026-09-25T00:00:00Z" }) });
check("admin extending INTO the next booking → 409", r.status === 409, `got ${r.status}`);
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ endDate: "2026-09-20T12:00:00Z" }) });
check("admin extending within the gap → 200", r.status === 200, JSON.stringify(r.body?.error));
r = await other(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
check("another client cannot cancel → 403", r.status === 403, `got ${r.status}`);
r = await client(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
check("owner can cancel their own → 200", r.status === 200, JSON.stringify(r.body?.error));
r = await client(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
check("cancelling twice → 409", r.status === 409, `got ${r.status}`);

console.log("\n── concurrency: the same window, twice at once ──");
const raceEq = await admin("/api/equipment", { method: "POST", body: JSON.stringify({
  code: "EXC-9002", name: "Race", type: "EXCAVATOR", dailyRate: 400, homeLat: 27.7, homeLng: 85.3 }) });
const raceId = raceEq.body?.data?.id;
const fire = () => client("/api/bookings", { method: "POST", body: JSON.stringify({
  equipmentId: raceId, startDate: "2027-03-01T00:00:00Z", endDate: "2027-03-10T00:00:00Z" }) });
const results = await Promise.all([fire(), fire(), fire(), fire()]);
const created = results.filter((x) => x.status === 201).length;
check("exactly ONE of 4 concurrent identical bookings wins", created === 1, `${created} succeeded: ${results.map((x) => x.status).join(",")}`);
const persisted = await prisma.booking.count({ where: { equipmentId: raceId, status: { in: ["PENDING", "CONFIRMED", "CHECKED_OUT"] } } });
check("  and only one row is persisted", persisted === 1, `${persisted} rows`);

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
