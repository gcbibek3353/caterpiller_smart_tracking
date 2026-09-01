/**
 * Seed verification — asserts the seeded data has the STRUCTURE the forecaster
 * and detectors need. A seed that runs fast but produces a flat demand curve is
 * a failed seed, and you will not notice until the forecast chart is on screen.
 *
 *   bun run seed && bun run seed:verify
 *
 * Read-only. Safe to run any time.
 */
const B = new URL("..", import.meta.url).pathname;
const { prisma } = await import(`${B}/src/db.ts`);
const q = (sql: string) => prisma.$queryRawUnsafe(sql) as Promise<any[]>;
let ok = 0, bad = 0;
const t = (label: string, pass: boolean, detail = "") => { console.log(`  ${pass?"✔":"✘"}  ${label}${detail?"  — "+detail:""}`); pass?ok++:bad++; };

console.log("── all four injected faults present ──");
const oh = await q(`SELECT e.code, count(*) n, round(max(t."engineTempC")::numeric,1) pk FROM "Telemetry" t JOIN "Equipment" e ON e.id=t."equipmentId" WHERE t."engineTempC">105 GROUP BY 1;`);
t("OVERHEAT ticks > 105°C", oh.length > 0, oh.map(r=>`${r.code}:${r.n} ticks peak ${r.pk}°C`).join(", "));

const hi = await q(`SELECT e.code, count(*) n FROM "DailyUsage" du JOIN "Equipment" e ON e.id=du."equipmentId" WHERE du."idleRatio">0.9 AND du."engineHours">6 GROUP BY 1;`);
t("HIGH_IDLE full-idle days", hi.length > 0, hi.map(r=>`${r.code}:${r.n}d`).join(", "));

const zr = await q(`SELECT e.code, count(*) n FROM "DailyUsage" du JOIN "Equipment" e ON e.id=du."equipmentId" WHERE du."engineHours"=0 AND du.date>=current_date-6 GROUP BY 1 HAVING count(*)>=2;`);
t("ZERO_RUNTIME >=2 consecutive days", zr.length > 0, zr.map(r=>`${r.code}:${r.n}d`).join(", "));

const fd = await q(`SELECT code, count(*) n FROM (SELECT e.code, t."engineState", t."fuelPct"-lag(t."fuelPct") OVER (PARTITION BY t."equipmentId" ORDER BY t.ts) d FROM "Telemetry" t JOIN "Equipment" e ON e.id=t."equipmentId") x WHERE d<-20 AND "engineState"='OFF' GROUP BY 1;`);
t("FUEL_DROP >20pts while OFF", fd.length > 0, fd.map(r=>`${r.code}:${r.n} drops`).join(", "));

console.log("\n── data shape ──");
const lr = await q(`SELECT count(*) FILTER (WHERE "checkinAt"::date>"endDate"::date) l, count(*) c FROM "Booking" WHERE "checkinAt" IS NOT NULL;`);
const pct = 100*Number(lr[0].l)/Number(lr[0].c);
t("late-return rate near 8%", pct>4 && pct<13, `${pct.toFixed(1)}%`);

const gr = await q(`WITH d AS (SELECT generate_series('2025-10-01'::date,'2025-12-31'::date,'1 day')::date AS dd), f AS (SELECT type,count(*) AS n FROM "Equipment" GROUP BY 1) SELECT f.type, round(100.0*count(d.dd)/(f.n*92),1) AS u FROM f JOIN "Equipment" e ON e.type=f.type LEFT JOIN "Booking" b ON b."equipmentId"=e.id AND b.status<>'CANCELLED' LEFT JOIN d ON d.dd BETWEEN b."startDate"::date AND b."endDate"::date GROUP BY f.type,f.n ORDER BY u DESC;`);
t("a type crosses 85% in peak season", Number(gr[0].u) > 85, `${gr[0].type} ${gr[0].u}%`);
t("a type sits below 60% (surplus story)", Number(gr[gr.length-1].u) < 60, `${gr[gr.length-1].type} ${gr[gr.length-1].u}%`);

const mons = await q(`WITH d AS (SELECT generate_series(date_trunc('day',now())-interval '365 days',date_trunc('day',now()),'1 day')::date AS dd) SELECT to_char(date_trunc('month',d.dd),'YYYY-MM') AS m,count(*) AS n FROM d JOIN "Booking" b ON d.dd BETWEEN b."startDate"::date AND b."endDate"::date AND b.status<>'CANCELLED' GROUP BY 1 ORDER BY 1;`);
const full = mons.slice(1,-1).map(r=>Number(r.n));
t("seasonality peak/trough > 1.8x", Math.max(...full)/Math.min(...full) > 1.8, `${(Math.max(...full)/Math.min(...full)).toFixed(2)}×`);

const dow = await q(`SELECT extract(dow from "startDate") AS d, count(*) AS n FROM "Booking" WHERE status<>'CANCELLED' GROUP BY 1 ORDER BY 1;`);
const mon = Number(dow.find(r=>Number(r.d)===1)?.n ?? 0), sun = Number(dow.find(r=>Number(r.d)===0)?.n ?? 0);
t("Monday >> Sunday starts", mon > sun*5, `Mon ${mon} vs Sun ${sun}`);

const noop = await q(`SELECT count(*) AS n FROM "Booking" WHERE "operatorId" IS NULL AND status<>'CANCELLED';`);
t("some bookings lack an operator (MISSING_OPERATOR)", Number(noop[0].n) > 10, `${noop[0].n} bookings`);

const dup = await q(`SELECT count(*) AS n FROM (SELECT "equipmentId",count(*) c FROM "Telemetry" GROUP BY "equipmentId","ts" HAVING count(*)>1) x;`);
t("no duplicate [equipmentId, ts] ticks", Number(dup[0].n) === 0);

const ov = await q(`SELECT count(*) AS n FROM "Booking" a JOIN "Booking" b ON a."equipmentId"=b."equipmentId" AND a.id<b.id AND a.status<>'CANCELLED' AND b.status<>'CANCELLED' AND a."startDate"<=b."endDate" AND b."startDate"<=a."endDate";`);
t("NO double-booked machines", Number(ov[0].n) === 0, `${ov[0].n} overlaps`);

const st = await q(`SELECT count(*) AS n FROM "Equipment" e WHERE e.status='CHECKED_OUT' AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b."equipmentId"=e.id AND b.status='CHECKED_OUT');`);
t("CHECKED_OUT equipment all have a live booking", Number(st[0].n) === 0);

console.log(`\n${bad===0?"✅":"❌"}  ${ok} passed, ${bad} failed`);
await prisma.$disconnect();
process.exit(bad===0?0:1);
