/**
 * B8/B9 contract checks — the response shapes the three ADMIN pages read.
 *
 *       bun run db:up
 *       bun run dev:test        # terminal 1
 *       bun run test:api:b8     # terminal 2
 *
 * Same job as b7, one floor up: `/admin/equipment`, `/admin/bookings` and
 * `/admin/scanner` render fields that `frontend/lib/types.ts` only *claims*
 * exist, because that file hand-duplicates `backend/src/contracts/` by team
 * decision. A rename on either side is a runtime bug rather than a compile
 * error, so this file is the missing compile error for those three pages.
 *
 * It walks the demo running order end to end — confirm, dispatch, check out,
 * check in — and asserts the exact keys each screen reads on the way through.
 *
 * Named `.check.ts`, not `.test.ts`: it TRUNCATEs, like the other suites.
 */

const { prisma } = await import("../src/db.ts");
const API = process.env.API_URL ?? "http://localhost:4000";
let pass = 0, fail = 0;
const check = (l: string, c: boolean, x = "") => { console.log(`${c ? "  ✔" : "  ✘ FAIL"}  ${l}${c ? "" : "   " + x}`); c ? pass++ : fail++; };

const mk = () => { let ck = "";
  return async (p: string, i: RequestInit = {}) => {
    const r = await fetch(API + p, { ...i, headers: { "Content-Type": "application/json", Origin: "http://localhost:3000", ...(ck ? { Cookie: ck } : {}), ...(i.headers ?? {}) } });
    const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(",").map(x => x.split(";")[0]).join("; ");
    const ct = r.headers.get("content-type") ?? "";
    return { status: r.status, ct, body: ct.includes("json") ? await r.json().catch(() => null) : null } as any; }; };

{
  const raw = process.env.DATABASE_URL ?? "";
  const host = raw ? new URL(raw).hostname : "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && process.env.ALLOW_REMOTE_TRUNCATE !== "1") {
    console.error(`\n✘ REFUSING TO RUN — this suite TRUNCATEs, and DATABASE_URL points at "${host}".`);
    console.error("  Use: bun run dev:test  +  bun run test:api:b8\n");
    process.exit(1);
  }
}

await prisma.$executeRawUnsafe('TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking","CheckEvent","Notification" CASCADE;');

const admin = mk(), c1 = mk(), c2 = mk();
const su = (c: any, e: string, n: string) => c("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: e, password: "password123", name: n, companyName: n + " Ltd" }) });
await su(admin, "b8-admin@r.com", "Admin");
await prisma.user.update({ where: { email: "b8-admin@r.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "b8-admin@r.com", password: "password123" }) });
await su(c1, "b8-c1@r.com", "Acme");
await su(c2, "b8-c2@r.com", "Globex");
const u1 = await prisma.user.findUniqueOrThrow({ where: { email: "b8-c1@r.com" } });
const u2 = await prisma.user.findUniqueOrThrow({ where: { email: "b8-c2@r.com" } });

// ══ /admin/equipment ════════════════════════════════════════════════
console.log("\n── /admin/equipment: create drawer ──");
const NEW = { code: "ADM-0001", name: "Drawer Excavator", type: "EXCAVATOR", dailyRate: 450.5,
  hourlyRate: 65, meterHours: 12.5, fuelCapacityL: 320, homeLat: 27.7, homeLng: 85.3,
  make: "CAT", model: "320", year: 2021, notes: "from the drawer" };
let r = await admin("/api/equipment", { method: "POST", body: JSON.stringify(NEW) });
check("POST create → 201", r.status === 201, JSON.stringify(r.body?.error));
const eqId = r.body?.data?.id;
// Every field the drawer round-trips: it reads these back to prefill an edit.
for (const f of Object.keys(NEW)) check(`  created.${f} echoed`, r.body?.data?.[f] !== undefined, JSON.stringify(Object.keys(r.body?.data ?? {})));
check("  dailyRate is a NUMBER (table calls .toFixed)", typeof r.body?.data?.dailyRate === "number", typeof r.body?.data?.dailyRate);
check("  meterHours is a NUMBER (table calls .toFixed)", typeof r.body?.data?.meterHours === "number", typeof r.body?.data?.meterHours);
check("  status defaults to AVAILABLE", r.body?.data?.status === "AVAILABLE", r.body?.data?.status);

console.log("\n── /admin/equipment: table filters ──");
r = await admin("/api/equipment?page=1&limit=50");
for (const f of ["items", "total", "page", "limit", "pages"]) check(`  paginated.${f} (pager reads it)`, r.body?.data?.[f] !== undefined);
r = await admin("/api/equipment?q=Drawer");
check("q= search finds it", (r.body?.data?.items ?? []).some((e: any) => e.id === eqId));
r = await admin("/api/equipment?type=EXCAVATOR");
check("type= filter works", (r.body?.data?.items ?? []).every((e: any) => e.type === "EXCAVATOR"));
r = await admin("/api/equipment?status=MAINTENANCE");
check("status= filter works", (r.body?.data?.items ?? []).every((e: any) => e.status === "MAINTENANCE"));

console.log("\n── /admin/equipment: edit + retire + reactivate ──");
r = await admin(`/api/equipment/${eqId}`, { method: "PATCH", body: JSON.stringify({ dailyRate: 500, notes: "" }) });
check("PATCH partial → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  rate updated", r.body?.data?.dailyRate === 500, String(r.body?.data?.dailyRate));
check("  a prose field CAN be cleared to empty", r.body?.data?.notes === "", JSON.stringify(r.body?.data?.notes));

const spare = await admin("/api/equipment", { method: "POST", body: JSON.stringify({ ...NEW, code: "ADM-0002", name: "Spare" }) });
const spareId = spare.body?.data?.id;
r = await admin(`/api/equipment/${spareId}`, { method: "DELETE" });
check("DELETE → soft delete to RETIRED", r.status === 200 && r.body?.data?.status === "RETIRED", JSON.stringify(r.body));
r = await admin("/api/equipment");
check("  retired hidden from the default table", !(r.body?.data?.items ?? []).some((e: any) => e.id === spareId));
r = await admin("/api/equipment?status=RETIRED");
check("  visible under the Retired filter", (r.body?.data?.items ?? []).some((e: any) => e.id === spareId));
/**
 * The drawer sends only the fields that actually changed, and this is why:
 * RETIRED is not in its status select, so a retired machine renders as
 * AVAILABLE. If a partial PATCH did not leave `status` alone, opening Edit to
 * fix a typo would quietly un-retire the machine.
 */
r = await admin(`/api/equipment/${spareId}`, { method: "PATCH", body: JSON.stringify({ dailyRate: 99 }) });
check("PATCH without status leaves RETIRED alone", r.body?.data?.status === "RETIRED", r.body?.data?.status);
r = await admin(`/api/equipment/${spareId}`, { method: "PATCH", body: JSON.stringify({ status: "AVAILABLE" }) });
check("Reactivate = PATCH back to AVAILABLE", r.status === 200 && r.body?.data?.status === "AVAILABLE", JSON.stringify(r.body?.error));

// ══ /admin/bookings ═════════════════════════════════════════════════
console.log("\n── /admin/bookings: the table row ──");
r = await c1("/api/bookings", { method: "POST", body: JSON.stringify({ equipmentId: eqId, startDate: "2027-10-01T00:00:00.000Z", endDate: "2027-10-05T00:00:00.000Z" }) });
check("client books → 201", r.status === 201, JSON.stringify(r.body?.error));
const bookingId = r.body?.data?.id;

r = await admin("/api/bookings?page=1&limit=50");
const row = (r.body?.data?.items ?? []).find((b: any) => b.id === bookingId);
check("admin list contains it", row != null);
for (const f of ["code", "status", "startDate", "endDate", "dailyRate", "totalAmount", "isOverdue"])
  check(`  row.${f} (the table renders it)`, row && f in row, JSON.stringify(Object.keys(row ?? {})));
check("  row.isOverdue is a boolean, not undefined", typeof row?.isOverdue === "boolean", String(row?.isOverdue));
check("  row.dailyRate is a NUMBER (.toFixed)", typeof row?.dailyRate === "number", typeof row?.dailyRate);
for (const f of ["id", "code", "name", "type"]) check(`  row.equipment.${f}`, row?.equipment?.[f] !== undefined);
for (const f of ["id", "name", "companyName"]) check(`  row.client.${f} (Client column)`, row?.client && f in row.client, JSON.stringify(row?.client));
check("  row.site key present (Dispatch column)", row && "site" in row);
check("  row.operator key present (Dispatch column)", row && "operator" in row);
check("  no qrToken in a list row", row?.qrToken === undefined);

console.log("\n── /admin/bookings: filters the chips send ──");
r = await admin("/api/bookings?status=PENDING");
check("status chip", (r.body?.data?.items ?? []).every((b: any) => b.status === "PENDING"));
r = await admin("/api/bookings?overdue=true");
check("Overdue-only chip → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  nothing brand-new is overdue (grace day holds)", !(r.body?.data?.items ?? []).some((b: any) => b.id === bookingId), JSON.stringify((r.body?.data?.items ?? []).map((b: any) => b.code)));
r = await admin("/api/bookings?from=2027-09-01T00:00:00.000Z&to=2027-11-01T00:00:00.000Z");
check("window filter finds it", (r.body?.data?.items ?? []).some((b: any) => b.id === bookingId));

console.log("\n── /admin/bookings: the dispatch dialog ──");
const site = await admin("/api/sites", { method: "POST", body: JSON.stringify({ name: "Acme Yard", lat: 27.7, lng: 85.3, clientId: u1.id }) });
const siteId = site.body?.data?.id;
const foreign = await admin("/api/sites", { method: "POST", body: JSON.stringify({ name: "Globex Yard", lat: 27.8, lng: 85.4, clientId: u2.id }) });
const op = await admin("/api/operators", { method: "POST", body: JSON.stringify({ name: "Ram Bahadur", licenseNo: "LIC-1", clientId: u1.id }) });
const opId = op.body?.data?.id;

r = await admin(`/api/sites?clientId=${u1.id}&limit=200`);
check("site dropdown is scoped to this client", (r.body?.data?.items ?? []).every((s: any) => s.clientId === u1.id) && (r.body?.data?.items ?? []).some((s: any) => s.id === siteId));
check("  and excludes the other client's yard", !(r.body?.data?.items ?? []).some((s: any) => s.id === foreign.body?.data?.id));
r = await admin(`/api/operators?clientId=${u1.id}&limit=200`);
const opt = (r.body?.data?.items ?? []).find((o: any) => o.id === opId);
check("operator dropdown is scoped to this client", opt != null);
check("  operator.licenseNo present (shown in the option label)", opt && "licenseNo" in opt, JSON.stringify(opt));

r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ siteId, operatorId: opId }) });
check("PATCH assigns site + operator → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  response re-joins site.name (row re-renders from it)", r.body?.data?.site?.name === "Acme Yard", JSON.stringify(r.body?.data?.site));
check("  response re-joins operator.name", r.body?.data?.operator?.name === "Ram Bahadur", JSON.stringify(r.body?.data?.operator));
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ siteId: foreign.body?.data?.id }) });
check("cross-client site → 400, not silently accepted", r.status === 400, `got ${r.status}`);
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ endDate: "2027-10-07T00:00:00.000Z" }) });
check("extend the return date → 200", r.status === 200, JSON.stringify(r.body?.error));

console.log("\n── /admin/bookings: Confirm shows the QR inline ──");
r = await admin(`/api/bookings/${bookingId}/confirm`, { method: "POST" });
check("confirm → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  status CONFIRMED", r.body?.data?.status === "CONFIRMED", r.body?.data?.status);
check("  qrDataUrl present (dialog renders it, no second trip)", typeof r.body?.data?.qrDataUrl === "string", typeof r.body?.data?.qrDataUrl);
check("  qrDataUrl is a PNG data URI", String(r.body?.data?.qrDataUrl).startsWith("data:image/png;base64,"), String(r.body?.data?.qrDataUrl).slice(0, 32));
check("  emailed flag present (dialog branches on it)", typeof r.body?.data?.emailed === "boolean", JSON.stringify(r.body?.data?.emailed));
check("  client.email present (dialog names the recipient)", typeof r.body?.data?.client?.email === "string", JSON.stringify(r.body?.data?.client));
check("  still no raw qrToken", r.body?.data?.qrToken === undefined);
r = await admin(`/api/bookings/${bookingId}/confirm`, { method: "POST" });
check("confirming twice → 409 (row shows the message)", r.status === 409, `got ${r.status}`);

// ══ /admin/scanner ══════════════════════════════════════════════════
console.log("\n── /admin/scanner: resolve ──");
const token = (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, select: { qrToken: true } })).qrToken;
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token: `RENT:v1:${token}` }) });
check("resolve the full RENT:v1: payload → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  action is CHECK_OUT", r.body?.data?.action === "CHECK_OUT", r.body?.data?.action);
check("  lastCheckout key present (prefill reads it)", r.body?.data && "lastCheckout" in r.body.data);
check("  isOverdue present (preview badges it)", typeof r.body?.data?.isOverdue === "boolean");
const pb = r.body?.data?.booking;
for (const f of ["code", "status", "startDate", "endDate"]) check(`  booking.${f} (identity plate)`, pb && f in pb);
check("  booking.client.companyName (identity plate)", pb?.client && "companyName" in pb.client);
check("  booking.equipment.code + name", pb?.equipment?.code != null && pb?.equipment?.name != null);
check("  preview NEVER carries qrToken", pb?.qrToken === undefined);
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token }) });
check("bare token also resolves (manual entry)", r.status === 200, `got ${r.status}`);

console.log("\n── /admin/scanner: commit CHECK_OUT ──");
r = await admin("/api/scan/commit", { method: "POST", body: JSON.stringify({ token, action: "CHECK_OUT", meterHours: 100.5, fuelPct: 90, conditionNotes: "clean" }) });
check("commit → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  action echoed", r.body?.data?.action === "CHECK_OUT");
check("  booking.status CHECKED_OUT (receipt renders the pill)", r.body?.data?.booking?.status === "CHECKED_OUT");
for (const f of ["at", "meterHours", "fuelPct", "type"]) check(`  checkEvent.${f} (receipt row)`, r.body?.data?.checkEvent?.[f] !== undefined, JSON.stringify(Object.keys(r.body?.data?.checkEvent ?? {})));
check("  emailed flag present", typeof r.body?.data?.emailed === "boolean");
r = await admin("/api/equipment/" + eqId);
check("  machine is now CHECKED_OUT", r.body?.data?.status === "CHECKED_OUT", r.body?.data?.status);

console.log("\n── /admin/scanner: the refusals the screen renders ──");
r = await admin("/api/scan/commit", { method: "POST", body: JSON.stringify({ token, action: "CHECK_IN" }) });
check("re-scan inside the cooldown → 409", r.status === 409, `got ${r.status}`);
check("  and the message is human-readable, not a code", String(r.body?.error?.message ?? "").length > 40, JSON.stringify(r.body?.error?.message));
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token: "NOT-A-REAL-TOKEN" }) });
check("unknown token → 404", r.status === 404, `got ${r.status}`);

const pend = await c1("/api/bookings", { method: "POST", body: JSON.stringify({ equipmentId: spareId, startDate: "2027-12-01T00:00:00.000Z", endDate: "2027-12-03T00:00:00.000Z" }) });
const pendToken = (await prisma.booking.findUniqueOrThrow({ where: { id: pend.body?.data?.id }, select: { qrToken: true } })).qrToken;
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token: pendToken }) });
check("scanning a PENDING booking → 409", r.status === 409, `got ${r.status}`);
check("  409 carries details.booking so the screen still shows what was scanned", r.body?.error?.details?.booking?.code != null, JSON.stringify(r.body?.error?.details));

console.log("\n── /admin/scanner: commit CHECK_IN ──");
// The cooldown is real time, not mockable through HTTP — reach past it the way
// the clock would, so the check-in path is actually exercised.
await prisma.checkEvent.updateMany({ where: { bookingId }, data: { at: new Date(Date.now() - 60_000) } });
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token }) });
check("second scan routes to CHECK_IN", r.body?.data?.action === "CHECK_IN", r.body?.data?.action);
check("  lastCheckout.meterHours prefills the form", r.body?.data?.lastCheckout?.meterHours === 100.5, JSON.stringify(r.body?.data?.lastCheckout));
r = await admin("/api/scan/commit", { method: "POST", body: JSON.stringify({ token, action: "CHECK_IN", meterHours: 108, fuelPct: 40 }) });
check("commit check-in → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  billableDays present (receipt row)", typeof r.body?.data?.billableDays === "number", JSON.stringify(r.body?.data?.billableDays));
check("  totalEngineHours present (receipt row)", typeof r.body?.data?.totalEngineHours === "number", JSON.stringify(r.body?.data?.totalEngineHours));
check("    and equals 108 − 100.5", r.body?.data?.totalEngineHours === 7.5, String(r.body?.data?.totalEngineHours));
check("  booking.totalAmount is a NUMBER (.toFixed)", typeof r.body?.data?.booking?.totalAmount === "number", typeof r.body?.data?.booking?.totalAmount);
check("  booking.status RETURNED", r.body?.data?.booking?.status === "RETURNED", r.body?.data?.booking?.status);
r = await admin("/api/equipment/" + eqId);
check("  machine is AVAILABLE again", r.body?.data?.status === "AVAILABLE", r.body?.data?.status);

console.log("\n── a returned booking is closed to the table's controls ──");
r = await admin(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ siteId }) });
check("PATCH a RETURNED booking → 409 (row hides Assign for this reason)", r.status === 409, `got ${r.status}`);

// ══ B11: the edge cases the scanner has to say something useful about ══
console.log("\n── B11: an already-used QR ──");
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token }) });
check("re-scanning a RETURNED booking → 409", r.status === 409, `got ${r.status}`);
check("  message says it was already used", /already been used/i.test(String(r.body?.error?.message)), JSON.stringify(r.body?.error?.message));
let d = r.body?.error?.details;
check("  details.status is RETURNED", d?.status === "RETURNED", JSON.stringify(d?.status));
check("  details.booking present (panel shows what was scanned)", d?.booking?.code != null);
check("  details.booking.checkinAt set (panel timestamps the refusal)", d?.booking?.checkinAt != null, JSON.stringify(d?.booking?.checkinAt));
check("  details.booking.checkoutAt set", d?.booking?.checkoutAt != null);
check("  and still no qrToken in a refusal", d?.booking?.qrToken === undefined);
r = await admin("/api/scan/commit", { method: "POST", body: JSON.stringify({ token, action: "CHECK_OUT" }) });
check("committing it anyway → 409, not a silent re-check-out", r.status === 409, `got ${r.status}`);

console.log("\n── B11: a cancelled booking's QR ──");
r = await admin(`/api/bookings/${pend.body?.data?.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
check("cancel the pending booking → 200", r.status === 200, JSON.stringify(r.body?.error));
r = await admin("/api/scan/resolve", { method: "POST", body: JSON.stringify({ token: pendToken }) });
check("scanning a CANCELLED booking → 409", r.status === 409, `got ${r.status}`);
check("  message says cancelled, not 'not found'", /cancelled/i.test(String(r.body?.error?.message)), JSON.stringify(r.body?.error?.message));
d = r.body?.error?.details;
check("  details.status is CANCELLED", d?.status === "CANCELLED", JSON.stringify(d?.status));
check("  details.booking present", d?.booking?.code != null);

console.log("\n── B11: overdue badges run off the server flag ──");
// Push a live rental a clear day past its return date and confirm BOTH the
// list flag and the ?overdue= filter agree. They used to be derived in two
// places with two different rules.
const od = await c1("/api/bookings", { method: "POST", body: JSON.stringify({ equipmentId: eqId, startDate: "2027-11-01T00:00:00.000Z", endDate: "2027-11-05T00:00:00.000Z" }) });
const odId = od.body?.data?.id;
await prisma.booking.update({ where: { id: odId }, data: { status: "CHECKED_OUT", endDate: new Date(Date.now() - 3 * 86_400_000) } });
r = await admin("/api/bookings?limit=200");
const odRow = (r.body?.data?.items ?? []).find((b: any) => b.id === odId);
check("a 3-day-late rental has isOverdue true on the row", odRow?.isOverdue === true, JSON.stringify(odRow?.isOverdue));
r = await admin("/api/bookings?overdue=true");
check("  and the Overdue-only chip returns it", (r.body?.data?.items ?? []).some((b: any) => b.id === odId));
// Exactly inside the grace day: due at midnight this morning, not late yet.
await prisma.booking.update({ where: { id: odId }, data: { endDate: new Date(Date.now() - 3600_000) } });
r = await admin("/api/bookings?limit=200");
check("due earlier TODAY is not yet overdue (the grace day)", ((r.body?.data?.items ?? []).find((b: any) => b.id === odId))?.isOverdue === false, "still flagged late on the return day");
r = await admin("/api/bookings?overdue=true");
check("  and the filter agrees with the flag", !(r.body?.data?.items ?? []).some((b: any) => b.id === odId));

console.log(`\n${fail === 0 ? "✅" : "❌"}  ${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
