/**
 * B7 contract checks — the response shapes the client booking pages read.
 *
 *       bun run db:up
 *       bun run dev:test        # terminal 1
 *       bun run test:api:b7     # terminal 2
 *
 * frontend/lib/types.ts is hand-written and DUPLICATES backend/src/contracts/
 * on purpose, and it says so: "a field rename here is a runtime bug, not a
 * compile error". This file is that missing compile error. It asserts every
 * field /equipment, /bookings and /bookings/[id] actually render — including
 * that dailyRate is a number (the pages call .toFixed on it) and that the 409
 * still carries details.conflictingBooking (the booking dialog renders it).
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
    console.error(`\n\u2718 REFUSING TO RUN \u2014 this suite TRUNCATEs, and DATABASE_URL points at "${host}".`);
    console.error("  Use: bun run dev:test  +  bun run test:api:b7\n");
    process.exit(1);
  }
}

await prisma.$executeRawUnsafe('TRUNCATE "user","session","account","verification","Equipment","Site","Operator","Booking","CheckEvent","Notification" CASCADE;');
const admin = mk(), client = mk();
const su = (c: any, e: string, n: string) => c("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: e, password: "password123", name: n }) });
await su(admin, "shape-admin@r.com", "Admin");
await prisma.user.update({ where: { email: "shape-admin@r.com" }, data: { role: "ADMIN" } });
await admin("/api/auth/sign-in/email", { method: "POST", body: JSON.stringify({ email: "shape-admin@r.com", password: "password123" }) });
await su(client, "shape-client@r.com", "Client One");

const eq = await admin("/api/equipment", { method: "POST", body: JSON.stringify({ code: "SHP-1", name: "Shape Excavator", type: "EXCAVATOR", dailyRate: 450, homeLat: 27.7, homeLng: 85.3, make: "CAT", model: "320", year: 2021 }) });
const eqId = eq.body?.data?.id;

console.log("\n── /equipment page: browse + availability filter ──");
let r = await client("/api/equipment?limit=60&availableFrom=2027-10-01&availableTo=2027-10-05");
check("list returns 200", r.status === 200);
const item = r.body?.data?.items?.[0];
check("items[] present", Array.isArray(r.body?.data?.items));
for (const f of ["id", "code", "name", "type", "status", "dailyRate"]) check(`  item.${f} exists`, item?.[f] !== undefined, JSON.stringify(Object.keys(item ?? {})));
check("  dailyRate is a NUMBER (page calls .toFixed)", typeof item?.dailyRate === "number", typeof item?.dailyRate);
check("  make/model/year present (card shows them)", "make" in item && "model" in item && "year" in item);

console.log("\n── booking form: create + 409 conflict shape ──");
r = await client("/api/bookings", { method: "POST", body: JSON.stringify({ equipmentId: eqId, startDate: "2027-10-01T00:00:00.000Z", endDate: "2027-10-05T00:00:00.000Z" }) });
check("create → 201", r.status === 201, JSON.stringify(r.body?.error));
const bookingId = r.body?.data?.id;
r = await client("/api/bookings", { method: "POST", body: JSON.stringify({ equipmentId: eqId, startDate: "2027-10-02T00:00:00.000Z", endDate: "2027-10-04T00:00:00.000Z" }) });
check("overlap → 409", r.status === 409, `got ${r.status}`);
const cb = r.body?.error?.details?.conflictingBooking;
check("  error.details.conflictingBooking present (dialog renders it)", cb != null, JSON.stringify(r.body?.error?.details));
for (const f of ["code", "startDate", "endDate"]) check(`    conflictingBooking.${f}`, cb?.[f] !== undefined);

console.log("\n── /bookings list row shape ──");
r = await client("/api/bookings?limit=50");
const row = r.body?.data?.items?.[0];
check("list 200 + items", r.status === 200 && Array.isArray(r.body?.data?.items));
for (const f of ["id", "code", "status", "startDate", "endDate", "dailyRate", "totalAmount"]) check(`  row.${f} exists`, row && f in row, JSON.stringify(Object.keys(row ?? {})));
check("  row.equipment joined (card shows name/code)", row?.equipment?.code !== undefined, JSON.stringify(row?.equipment));
check("  row.equipment.name present", row?.equipment?.name !== undefined);
check("  row.site key present (may be null)", row && "site" in row);
check("  no qrToken leaked to the list", row?.qrToken === undefined);

console.log("\n── /bookings/[id] detail shape ──");
r = await client(`/api/bookings/${bookingId}`);
const d = r.body?.data;
check("detail 200", r.status === 200);
for (const f of ["checkoutAt", "checkinAt", "isOverdue"]) check(`  detail.${f} exists`, d && f in d, JSON.stringify(Object.keys(d ?? {})));
check("  detail.equipment.type present", d?.equipment?.type !== undefined);
check("  detail.operator key present", d && "operator" in d);
check("  isOverdue is boolean", typeof d?.isOverdue === "boolean");

console.log("\n── QR panel: statuses and image ──");
r = await client(`/api/bookings/${bookingId}/qr.png`);
check("PENDING → 409 (panel shows 'issued once confirmed')", r.status === 409, `got ${r.status}`);
await admin(`/api/bookings/${bookingId}/confirm`, { method: "POST" });
r = await client(`/api/bookings/${bookingId}/qr.png`);
check("CONFIRMED → 200", r.status === 200, `got ${r.status}`);
check("  content-type image/png (blob fetch)", r.ct.includes("image/png"), r.ct);

console.log("\n── cancel from the detail page ──");
r = await client(`/api/bookings/${bookingId}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) });
check("client cancels own booking → 200", r.status === 200, JSON.stringify(r.body?.error));
check("  status now CANCELLED", r.body?.data?.status === "CANCELLED");

console.log(`\n${pass} passed, ${fail} failed`);
await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
