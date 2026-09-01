/**
 * A7 API tests — equipment / site / operator CRUD + the availability overlap.
 *
 *   Terminal 1:  bun run dev
 *   Terminal 2:  bun run test:api
 *
 * Named `.check.ts`, NOT `.test.ts`, on purpose: it needs a live server, so
 * letting `bun test` auto-discover it makes the unit-test suite fail for
 * everyone who happens not to have the API running.
 *
 * ⚠️  DESTRUCTIVE: truncates users, equipment, sites, operators and bookings.
 * Run it against the local dev database only, never a seeded demo DB you care about.
 *
 * Named `.check.ts`, not `.test.ts`, ON PURPOSE — it's a standalone script
 * (top-level `process.exit()`, no `test()`/`describe()`), not a bun:test
 * suite. `bun test` recursively runs every `*.test.ts` it finds; if this
 * file matched that glob, a plain `bun test` at the project root would
 * silently TRUNCATE whatever DB `DATABASE_URL` points at, then this file's
 * `process.exit()` would kill the whole test run before any real unit
 * tests got a chance to execute — no error, no warning, everyone's tests
 * just silently don't run. Confirmed this happening while merging in D's
 * branch. Keep it out of the `*.test.ts` glob.
 *
 * The overlap boundary cases below are the contract B4 must preserve when it
 * adds booking creation. If you change the blocking-status list or the
 * inclusive bounds, these tests are what tells you what you broke.
 */
const B = new URL("..", import.meta.url).pathname;

/**
 * Refuse to truncate anything that is not local Postgres.
 *
 * The team shares one Neon database. This file TRUNCATEs users, sessions,
 * equipment, sites, operators and bookings — against Neon that logs all four of
 * us out and deletes everyone's fixtures mid-work. `bun run test:api` points
 * DATABASE_URL at TEST_DATABASE_URL for you; this guard is what catches the
 * other path, where someone runs `bun tests/a7.api.check.ts` directly.
 */
{
  const raw = process.env.DATABASE_URL ?? "";
  const host = raw ? new URL(raw).hostname : "";
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && process.env.ALLOW_REMOTE_TRUNCATE !== "1") {
    console.error(`
✘ REFUSING TO RUN — this suite TRUNCATEs, and DATABASE_URL points at "${host}".

  That is the shared database. Running here would log the whole team out and
  delete their data.

  Run it against local Postgres instead:
      bun run db:up
      bun run dev:test     # terminal 1 — server on the test database
      bun run test:api     # terminal 2

  If you genuinely mean to wipe a remote database, set ALLOW_REMOTE_TRUNCATE=1.
`);
    process.exit(1);
  }
}

const { prisma } = await import(`${B}/src/db.ts`);

// Set by scripts/with-test-db.ts, which runs the test stack on 4001 so it cannot
// collide with a `bun run dev` server already holding 4000 against Neon.
const API = process.env.API_URL ?? "http://localhost:4000";

// Fail loudly and usefully rather than with a bare connection error.
try {
  await fetch(`${API}/health`);
} catch {
  console.error(`\n✘ No API at ${API}. Start it first:  bun run dev\n`);
  process.exit(1);
}
const ORIGIN = "http://localhost:3000";

let pass = 0, fail = 0;
const check = (label: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "  ✔" : "  ✘ FAIL"}  ${label}${cond ? "" : "   " + extra}`);
  cond ? pass++ : fail++;
};

// ── tiny cookie-aware client ──
const mkClient = () => {
  let cookie = "";
  return async (path: string, init: RequestInit = {}) => {
    const res = await fetch(API + path, {
      ...init,
      headers: { "Content-Type": "application/json", Origin: ORIGIN,
                 ...(cookie ? { Cookie: cookie } : {}), ...(init.headers ?? {}) },
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(",").map(p => p.split(";")[0]).join("; ");
    const body = await res.json().catch(() => null);
    return { status: res.status, body } as { status: number; body: any };
  };
};

await prisma.$executeRawUnsafe('TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking" CASCADE;');

const admin = mkClient(), client = mkClient(), other = mkClient();
await admin("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: "admin@rental.com", password: "admin123x", name: "Admin" }) });
await prisma.user.update({ where: { email: "admin@rental.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "admin@rental.com", password: "admin123x" }) });

await client("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: "c1@b.com", password: "client123", name: "Client One" }) });
await other("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: "c2@b.com", password: "client123", name: "Client Two" }) });
const c1 = await prisma.user.findUniqueOrThrow({ where: { email: "c1@b.com" } });
const c2 = await prisma.user.findUniqueOrThrow({ where: { email: "c2@b.com" } });

console.log("\n── RBAC ──");
const mk = (code: string) => ({ code, name: code, type: "EXCAVATOR", dailyRate: 450, homeLat: 27.7, homeLng: 85.3 });
let r = await admin("/api/equipment", { method: "POST", body: JSON.stringify(mk("EXC-0001")) });
check("ADMIN can create equipment (201)", r.status === 201, JSON.stringify(r.body));
const eqId = r.body?.data?.id;
check("dailyRate is a NUMBER not a string", typeof r.body?.data?.dailyRate === "number", typeof r.body?.data?.dailyRate);

r = await client("/api/equipment", { method: "POST", body: JSON.stringify(mk("EXC-0002")) });
check("CLIENT cannot create equipment (403)", r.status === 403, `${r.status}`);

r = await admin("/api/equipment", { method: "POST", body: JSON.stringify(mk("EXC-0001")) });
check("duplicate code → 409 DUPLICATE", r.status === 409 && r.body?.error?.code === "DUPLICATE", JSON.stringify(r.body));

r = await mkClient()("/api/equipment");
check("anonymous list → 401", r.status === 401, `${r.status}`);

console.log("\n── availability overlap ──");
await admin("/api/equipment", { method: "POST", body: JSON.stringify(mk("EXC-0003")) });
// EXC-0001 is booked 10th → 20th September
await prisma.booking.create({ data: {
  code: "BK-TEST-1", equipmentId: eqId, clientId: c1.id,
  startDate: new Date("2026-09-10T00:00:00Z"), endDate: new Date("2026-09-20T00:00:00Z"),
  status: "CONFIRMED", qrToken: "tok-test-1", dailyRate: "450.00",
}});

const codes = async (from: string, to: string) => {
  const res = await admin(`/api/equipment?availableFrom=${from}&availableTo=${to}`);
  return (res.body?.data?.items ?? []).map((e: any) => e.code).sort();
};

check("window fully inside booking → machine hidden",      !(await codes("2026-09-12","2026-09-15")).includes("EXC-0001"));
check("window straddling booking start → hidden",          !(await codes("2026-09-05","2026-09-12")).includes("EXC-0001"));
check("window straddling booking end → hidden",            !(await codes("2026-09-18","2026-09-25")).includes("EXC-0001"));
check("window enclosing booking → hidden",                 !(await codes("2026-09-01","2026-09-30")).includes("EXC-0001"));
check("BOUNDARY: request starts on booking END date → hidden", !(await codes("2026-09-20","2026-09-25")).includes("EXC-0001"));
check("BOUNDARY: request ends on booking START date → hidden", !(await codes("2026-09-05","2026-09-10")).includes("EXC-0001"));
check("window entirely before booking → visible",          (await codes("2026-09-01","2026-09-09")).includes("EXC-0001"));
check("window entirely after booking → visible",           (await codes("2026-09-21","2026-09-30")).includes("EXC-0001"));
check("unbooked machine always visible",                   (await codes("2026-09-12","2026-09-15")).includes("EXC-0003"));

// a CANCELLED booking must not block
await prisma.booking.updateMany({ where: { code: "BK-TEST-1" }, data: { status: "CANCELLED" } });
check("CANCELLED booking does not block", (await codes("2026-09-12","2026-09-15")).includes("EXC-0001"));
await prisma.booking.updateMany({ where: { code: "BK-TEST-1" }, data: { status: "CONFIRMED" } });

console.log("\n── soft delete ──");
r = await admin(`/api/equipment/${eqId}`, { method: "DELETE" });
check("retire refused while booking is live (409)", r.status === 409, JSON.stringify(r.body));
await prisma.booking.updateMany({ where: { code: "BK-TEST-1" }, data: { status: "RETURNED" } });
r = await admin(`/api/equipment/${eqId}`, { method: "DELETE" });
check("retire succeeds once free → RETIRED", r.body?.data?.status === "RETIRED", JSON.stringify(r.body));
r = await admin("/api/equipment");
check("RETIRED hidden from default list", !(r.body?.data?.items ?? []).map((e:any)=>e.code).includes("EXC-0001"));
r = await admin("/api/equipment?status=RETIRED");
check("RETIRED visible when explicitly filtered", (r.body?.data?.items ?? []).map((e:any)=>e.code).includes("EXC-0001"));

console.log("\n── sites: cross-client isolation ──");
r = await client("/api/sites", { method: "POST", body: JSON.stringify({ name: "Site A", lat: 27.7, lng: 85.3, clientId: "SOMEONE-ELSE" }) });
const siteId = r.body?.data?.id;
check("CLIENT-supplied clientId is IGNORED (pinned to self)", r.body?.data?.clientId === c1.id, JSON.stringify(r.body?.data));
r = await other(`/api/sites/${siteId}`);
check("other client cannot read it (403)", r.status === 403, `${r.status}`);
r = await other("/api/sites");
check("other client's list does not contain it", !(r.body?.data?.items ?? []).some((s:any)=>s.id===siteId));
r = await admin(`/api/sites/${siteId}`);
check("ADMIN can read any site", r.status === 200, `${r.status}`);
r = await other(`/api/sites/${siteId}`, { method: "PATCH", body: JSON.stringify({ name: "hijack" }) });
check("other client cannot PATCH it (403)", r.status === 403, `${r.status}`);

/**
 * `?clientId=` — the affordance the admin bookings UI needs so its
 * assign-site control offers only the sites belonging to the booking's own
 * client. Like every other client-scoped filter it is an ADMIN one: a CLIENT
 * sending it stays pinned to their own rows rather than having it honoured,
 * or the filter becomes an enumeration hole.
 */
r = await other("/api/sites", { method: "POST", body: JSON.stringify({ name: "Site B", lat: 27.8, lng: 85.4 }) });
const otherSiteId = r.body?.data?.id;
r = await admin(`/api/sites?clientId=${c1.id}`);
check("ADMIN can filter sites by clientId", (r.body?.data?.items ?? []).every((s:any)=>s.clientId===c1.id) && (r.body?.data?.items ?? []).some((s:any)=>s.id===siteId), JSON.stringify(r.body?.data?.items?.map((s:any)=>s.clientId)));
check("  and the other client's site is excluded", !(r.body?.data?.items ?? []).some((s:any)=>s.id===otherSiteId));
r = await other(`/api/sites?clientId=${c1.id}`);
check("CLIENT's ?clientId= is IGNORED, not honoured", !(r.body?.data?.items ?? []).some((s:any)=>s.id===siteId), JSON.stringify(r.body?.data?.items?.map((s:any)=>s.id)));

r = await client("/api/operators", { method: "POST", body: JSON.stringify({ name: "Ram Operator" }) });
const opId = r.body?.data?.id;
r = await admin(`/api/operators?clientId=${c1.id}`);
check("ADMIN can filter operators by clientId", (r.body?.data?.items ?? []).every((o:any)=>o.clientId===c1.id) && (r.body?.data?.items ?? []).some((o:any)=>o.id===opId), JSON.stringify(r.body?.data?.items?.map((o:any)=>o.clientId)));
r = await admin(`/api/operators?clientId=${c2.id}`);
check("  filtering to a client with none is empty, not everything", !(r.body?.data?.items ?? []).some((o:any)=>o.id===opId));

console.log("\n── validation still enforced ──");
r = await admin("/api/equipment", { method: "POST", body: JSON.stringify({ code: "bad code!", name: "x", type: "EXCAVATOR", dailyRate: 1, homeLat: 0, homeLng: 0 }) });
check("bad code format → 422", r.status === 422, `${r.status}`);
r = await admin("/api/equipment", { method: "POST", body: JSON.stringify({ ...mk("EXC-0009"), homeLat: 999 }) });
check("lat out of range → 422", r.status === 422, `${r.status}`);
r = await admin(`/api/equipment/${eqId}`, { method: "PATCH", body: JSON.stringify({}) });
check("empty PATCH body → 422", r.status === 422, `${r.status}`);
r = await admin("/api/equipment/does-not-exist");
check("unknown id → 404", r.status === 404, `${r.status}`);

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
