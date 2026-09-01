/**
 * Seed — 12 months of history with real, learnable structure.
 *
 *   bun run seed          # wipes and reseeds; safe to run any number of times
 *   bun run seed:fresh    # db push --force-reset first, then seed
 *
 * Re-runnable by construction: it TRUNCATEs every domain table before writing,
 * and the PRNG is fixed-seed, so every run produces byte-identical data. You can
 * run it thirty seconds before the demo without wondering what changed.
 *
 * Tunables live in prisma/seed/config.ts — not in this file.
 */
import type { BookingStatus, EquipmentStatus, EquipmentType, Prisma } from "@prisma/client";
import { prisma } from "../src/db";
import { auth } from "../src/lib/auth";
import { Rng } from "../src/lib/random";
import { addDays, addMinutes, daysBetween, eachUtcDay, overlaps, startOfUtcDay } from "../src/lib/dates";
import { metersToDegLat, metersToDegLng } from "../src/lib/geo";
import * as C from "./seed/config";
import { arrivalRate, drawDuration, makeSpikes } from "./seed/demand";
import { generateTicks, rollupTicks, type DailyRow, type MachineState, type Tick } from "./seed/telemetry";
import { photoFor } from "./equipment-images";

const rng = new Rng(C.SEED);
const t0 = Date.now();
const step = (label: string) =>
  console.log(`  ${String(((Date.now() - t0) / 1000).toFixed(1)).padStart(5)}s  ${label}`);

const TODAY = startOfUtcDay(new Date());
const HISTORY_START = addDays(TODAY, -C.HISTORY_DAYS);
const FUTURE_END = addDays(TODAY, C.FUTURE_DAYS);
const TELEMETRY_START = addDays(TODAY, -C.TELEMETRY_DAYS);

/**
 * Name the target before wiping it. Not a block — seeding shared Neon is the
 * intended flow and A does it deliberately — but "which database did I just
 * truncate" should never be a question you have to answer after the fact.
 */
function announceTarget() {
  const raw = process.env.DATABASE_URL ?? "";
  const host = raw ? new URL(raw).hostname : "(unset)";
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  console.log(
    local
      ? `  seeding LOCAL Postgres (${host})`
      : `  ⚠  seeding SHARED database — ${host}\n     Every teammate's session and fixtures are about to be replaced.`,
  );
}

// ────────────────────────────────────────────────────────────── reset
async function reset() {
  // TRUNCATE ... CASCADE is one statement and far faster than deleteMany per table.
  await prisma.$executeRawUnsafe(`
    TRUNCATE "Telemetry","DailyUsage","Anomaly","CheckEvent","Notification",
             "DemandForecast","Booking","Site","Operator","Equipment",
             "session","account","verification","user"
    RESTART IDENTITY CASCADE;
  `);
  step("reset — all tables truncated");
}

// ────────────────────────────────────────────────────────────── users
async function seedUsers() {
  // Created through better-auth's own API so the password hashing matches what
  // sign-in expects. Writing `user`/`account` rows by hand produces accounts
  // that exist but can never log in.
  const mk = async (email: string, password: string, name: string) => {
    await auth.api.signUpEmail({ body: { email, password, name } });
    return prisma.user.findUniqueOrThrow({ where: { email } });
  };

  await mk(C.ADMIN.email, C.ADMIN.password, C.ADMIN.name);
  const admin = await prisma.user.update({
    where: { email: C.ADMIN.email },
    data: { role: "ADMIN", emailVerified: true },
  });

  const clients = [];
  for (const c of C.CLIENTS) {
    await mk(c.email, C.CLIENT_PASSWORD, c.name);
    clients.push(
      await prisma.user.update({
        where: { email: c.email },
        data: { role: "CLIENT", companyName: c.company, phone: c.phone, emailVerified: true },
      }),
    );
  }

  step(`users — 1 admin + ${clients.length} clients`);
  return { admin, clients };
}

// ────────────────────────────────────────────────────────── equipment
const MAKES = ["Caterpillar", "Komatsu", "Volvo", "Hitachi", "JCB", "Liebherr"];

async function seedEquipment() {
  const data: Prisma.EquipmentCreateManyInput[] = [];

  for (const spec of Object.values(C.FLEET)) {
    for (let i = 1; i <= spec.count; i++) {
      const rate = rng.float(spec.dailyRate[0], spec.dailyRate[1]);
      const code = `${spec.prefix}-${String(i).padStart(4, "0")}`;
      data.push({
        code,
        // Keyed on the code, not drawn from `rng` — a photo must not consume
        // randomness, or adding images would shift every downstream draw and
        // silently change the whole dataset the demo was tuned against.
        imageUrl: photoFor(spec.type, code)?.url ?? null,
        name: `${rng.pick(MAKES)} ${spec.type.replace("_", " ").toLowerCase()}`,
        type: spec.type,
        make: rng.pick(MAKES),
        model: `${rng.pick(["X", "D", "M", "ZX"])}${rng.int(120, 480)}`,
        year: rng.int(2016, 2025),
        dailyRate: rate.toFixed(2),
        hourlyRate: (rate / 8).toFixed(2),
        meterHours: rng.float(200, 9000),
        fuelCapacityL: spec.fuelCapacityL,
        homeLat: C.DEPOT.lat + rng.float(-0.01, 0.01),
        homeLng: C.DEPOT.lng + rng.float(-0.01, 0.01),
      });
    }
  }

  await prisma.equipment.createMany({ data });
  const all = await prisma.equipment.findMany({ orderBy: { code: "asc" } });
  step(`equipment — ${all.length} machines`);
  return all;
}

// ────────────────────────────────────────────────── sites & operators
const SITE_NAMES = ["Ring Road Widening", "Thamel Tower", "Bhaktapur Bypass", "Airport Apron",
  "Lalitpur Housing", "Balaju Industrial", "Chobhar Quarry", "Budhanilkantha Villas",
  "Kalanki Flyover", "Sitapaila Reservoir"];
const OPERATOR_NAMES = ["Krishna Bahadur", "Sanjay Thapa", "Milan Magar", "Pemba Sherpa",
  "Rajesh Lama", "Hari Prasad", "Nabin Chaudhary", "Sushil Bhandari", "Deepak Limbu", "Arjun Bista"];

async function seedSitesAndOperators(clients: { id: string }[]) {
  const sites: Prisma.SiteCreateManyInput[] = [];
  const operators: Prisma.OperatorCreateManyInput[] = [];

  for (const client of clients) {
    for (let i = 0; i < rng.int(3, 6); i++) {
      sites.push({
        name: `${rng.pick(SITE_NAMES)} ${rng.int(1, 99)}`,
        address: `Ward ${rng.int(1, 32)}, Kathmandu`,
        lat: C.DEPOT.lat + rng.float(-C.CITY_SPREAD, C.CITY_SPREAD),
        lng: C.DEPOT.lng + rng.float(-C.CITY_SPREAD, C.CITY_SPREAD),
        radiusMeters: rng.int(300, 1200),
        clientId: client.id,
      });
    }
    for (let i = 0; i < rng.int(2, 4); i++) {
      operators.push({
        name: rng.pick(OPERATOR_NAMES),
        licenseNo: `NP-${rng.int(10000, 99999)}`,
        phone: `+977-98${rng.int(10000000, 99999999)}`,
        clientId: client.id,
      });
    }
  }

  await prisma.site.createMany({ data: sites });
  await prisma.operator.createMany({ data: operators });

  const [allSites, allOperators] = await Promise.all([
    prisma.site.findMany(),
    prisma.operator.findMany(),
  ]);
  step(`sites & operators — ${allSites.length} sites, ${allOperators.length} operators`);
  return { allSites, allOperators };
}

// ─────────────────────────────────────────────────────────── bookings
type Equip = { id: string; type: EquipmentType; dailyRate: Prisma.Decimal };

async function seedBookings(
  equipment: Equip[],
  clients: { id: string }[],
  sites: { id: string; clientId: string }[],
  operators: { id: string; clientId: string }[],
) {
  const totalDays = C.HISTORY_DAYS + C.FUTURE_DAYS;
  const spikes = makeSpikes(rng, HISTORY_START, totalDays);
  const days = eachUtcDay(HISTORY_START, FUTURE_END);

  const byType = new Map<EquipmentType, Equip[]>();
  for (const e of equipment) {
    const arr = byType.get(e.type);
    if (arr) arr.push(e);
    else byType.set(e.type, [e]);
  }

  /** Booked windows per machine, so the seed never double-books. */
  const busy = new Map<string, Array<[Date, Date]>>();
  const rows: Prisma.BookingCreateManyInput[] = [];
  let unmet = 0;
  let seq = 0;

  for (const [dayIndex, day] of days.entries()) {
    for (const [type, pool] of byType) {
      const lambda = arrivalRate(type, pool.length, day, dayIndex, totalDays, spikes, rng);

      for (let n = rng.poisson(lambda); n > 0; n--) {
        const duration = drawDuration(rng);
        const startDate = day;
        const endDate = addDays(day, duration);

        // Respect the SAME overlap rule the availability API enforces.
        const free = rng
          .shuffle(pool)
          .find((e) => !(busy.get(e.id) ?? []).some(([s, x]) => overlaps(startDate, endDate, s, x)));

        if (!free) {
          unmet++; // demand the fleet could not serve — this is what makes the gap analysis real
          continue;
        }

        const client = rng.pick(clients);
        const clientSites = sites.filter((s) => s.clientId === client.id);
        const clientOps = operators.filter((o) => o.clientId === client.id);

        // status follows from where the window sits relative to today
        let status: BookingStatus;
        let checkoutAt: Date | null = null;
        let checkinAt: Date | null = null;

        if (endDate < TODAY) {
          status = "RETURNED";
          checkoutAt = addMinutes(startDate, rng.int(7 * 60, 11 * 60));
          const late = rng.bool(C.LATE_RETURN_RATE);
          checkinAt = addMinutes(endDate, late ? rng.int(26 * 60, 96 * 60) : rng.int(8 * 60, 17 * 60));
        } else if (startDate <= TODAY) {
          status = rng.bool(0.85) ? "CHECKED_OUT" : "CONFIRMED";
          if (status === "CHECKED_OUT") checkoutAt = addMinutes(startDate, rng.int(7 * 60, 11 * 60));
        } else {
          status = rng.bool(0.7) ? "CONFIRMED" : "PENDING";
        }

        // A cancelled tail keeps CANCELLED represented without blocking machines.
        if (status === "PENDING" && rng.bool(0.12)) status = "CANCELLED";

        if (status !== "CANCELLED") {
          const arr = busy.get(free.id);
          if (arr) arr.push([startDate, endDate]);
          else busy.set(free.id, [[startDate, endDate]]);
        }

        const rate = Number(free.dailyRate);
        seq++;
        rows.push({
          code: `BK-${startDate.getUTCFullYear()}-${String(seq).padStart(6, "0")}`,
          equipmentId: free.id,
          clientId: client.id,
          siteId: clientSites.length ? rng.pick(clientSites).id : null,
          // ~8% have no operator assigned → MISSING_OPERATOR has something to find
          operatorId: clientOps.length && rng.bool(0.92) ? rng.pick(clientOps).id : null,
          startDate,
          endDate,
          status,
          qrToken: `seed-${seq}-${Math.floor(rng.next() * 1e12).toString(36)}`,
          qrIssuedAt: startDate,
          checkoutAt,
          checkinAt,
          dailyRate: rate.toFixed(2),
          totalAmount: status === "RETURNED" ? (rate * duration).toFixed(2) : null,
        });
      }
    }
  }

  await prisma.booking.createMany({ data: rows });
  const created = await prisma.booking.findMany({
    include: { site: true },
    orderBy: { startDate: "asc" },
  });
  step(`bookings — ${created.length} created (${unmet} unmet requests, fleet was full)`);
  return created;
}

// ────────────────────────────────────────────────────────── telemetry
async function seedTelemetry(
  bookings: Awaited<ReturnType<typeof seedBookings>>,
  equipment: Equip[],
) {
  const active = bookings.filter(
    (b) =>
      (b.status === "CHECKED_OUT" || b.status === "RETURNED") &&
      overlaps(b.startDate, b.endDate, TELEMETRY_START, TODAY),
  );

  /**
   * Faults must land on machines that are ACTUALLY on rent right now, otherwise
   * the fault window falls on a machine with no ticks and the detector finds
   * nothing. Pick targets from live bookings, not from the fleet list.
   */
  const faultFor = new Map<string, { kind: (typeof C.INJECTED_FAULTS)[number]["kind"]; from: Date }>();
  const typeOf = new Map(equipment.map((e) => [e.id, e.type]));
  for (const f of C.INJECTED_FAULTS) {
    const eligible = [
      ...new Set(
        active
          .filter((b) => b.endDate >= TODAY && typeOf.get(b.equipmentId) === f.type)
          .map((b) => b.equipmentId),
      ),
    ].filter((id) => !faultFor.has(id));

    // Fall back to any machine of that type still under telemetry if none is live.
    const pool = eligible.length
      ? eligible
      : [...new Set(active.map((b) => b.equipmentId))].filter(
          (id) => typeOf.get(id) === f.type && !faultFor.has(id),
        );

    const target = pool[f.nth % Math.max(1, pool.length)];
    if (!target) {
      console.warn(`     ⚠ no ${f.type} with telemetry — fault "${f.kind}" not injected`);
      continue;
    }

    /**
     * Anchor the fault window to the LAST DAY THIS MACHINE ACTUALLY EMITS, not
     * to today. A machine whose rental ended a week ago has no ticks in the
     * last 24h, so a today-relative window would silently inject nothing —
     * which is exactly how the fuel-drop fault went missing the first time.
     */
    const lastTickDay = active
      .filter((b) => b.equipmentId === target)
      .reduce((max, b) => (b.endDate > max ? b.endDate : max), TELEMETRY_START);
    const anchor = lastTickDay < TODAY ? lastTickDay : TODAY;
    faultFor.set(target, { kind: f.kind, from: addDays(anchor, -f.days) });
  }

  const machineState = new Map<string, MachineState>();
  const allTicks: Tick[] = [];
  const dailyFromTicks: DailyRow[] = [];

  for (const b of active) {
    const site = b.site ?? {
      lat: C.DEPOT.lat + rng.float(-0.05, 0.05),
      lng: C.DEPOT.lng + rng.float(-0.05, 0.05),
      radiusMeters: 600,
    };

    const from = b.startDate > TELEMETRY_START ? b.startDate : TELEMETRY_START;
    const to = b.endDate < TODAY ? b.endDate : addMinutes(TODAY, 23 * 60 + 50);
    if (from > to) continue;

    const state: MachineState =
      machineState.get(b.equipmentId) ??
      {
        engineHours: rng.float(200, 9000),
        fuelPct: rng.float(35, 95),
        tempC: C.TEMP.ambient,
        lat: site.lat + metersToDegLat(rng.float(-120, 120)),
        lng: site.lng + metersToDegLng(rng.float(-120, 120), site.lat),
      };

    const ticks = generateTicks({
      equipmentId: b.equipmentId,
      bookingId: b.id,
      operatorId: b.operatorId,
      site,
      from,
      to,
      state,
      rng,
      fault: faultFor.get(b.equipmentId),
    });

    machineState.set(b.equipmentId, state);
    allTicks.push(...ticks);
    dailyFromTicks.push(...rollupTicks(ticks, site));
  }

  // Batch to stay well under Postgres' 65535 bind-parameter ceiling.
  const BATCH = 2000;
  for (let i = 0; i < allTicks.length; i += BATCH) {
    await prisma.telemetry.createMany({ data: allTicks.slice(i, i + BATCH), skipDuplicates: true });
  }
  step(`telemetry — ${allTicks.length.toLocaleString()} ticks over ${C.TELEMETRY_DAYS} days`);

  return dailyFromTicks;
}

// ───────────────────────────────────────────────────────── daily usage
async function seedDailyUsage(
  bookings: Awaited<ReturnType<typeof seedBookings>>,
  derived: DailyRow[],
) {
  // The recent window is DERIVED from the ticks above, so seeded days and live
  // days are identical in shape. Older days are synthesised — there are no ticks
  // that far back and generating a year of them costs ~2M rows.
  const rows: Prisma.DailyUsageCreateManyInput[] = derived.map((d) => ({ ...d }));
  const covered = new Set(derived.map((d) => `${d.equipmentId}|${d.date.toISOString().slice(0, 10)}`));

  for (const b of bookings) {
    if (b.status === "CANCELLED" || b.status === "PENDING") continue;
    const from = b.startDate < HISTORY_START ? HISTORY_START : b.startDate;
    const to = b.endDate > TODAY ? TODAY : b.endDate;
    if (from > to) continue;

    for (const day of eachUtcDay(from, to)) {
      const key = `${b.equipmentId}|${day.toISOString().slice(0, 10)}`;
      if (covered.has(key)) continue;
      covered.add(key);

      const dow = day.getUTCDay();
      const engineHours =
        dow === 0 ? rng.float(0, 1.5) : Math.max(0, rng.gauss(7.4, 2.1));
      const idleRatio = rng.clampedGauss(0.28, 0.12, 0.02, 0.9);
      const idleHours = engineHours * idleRatio;
      const workingHours = engineHours - idleHours;
      const fuelUsedPct = workingHours * rng.float(7, 11) + idleHours * rng.float(2, 4);

      rows.push({
        equipmentId: b.equipmentId,
        bookingId: b.id,
        date: day,
        engineHours: Number(engineHours.toFixed(2)),
        workingHours: Number(workingHours.toFixed(2)),
        idleHours: Number(idleHours.toFixed(2)),
        idleRatio: Number(idleRatio.toFixed(3)),
        isOperatingDay: engineHours >= 0.5,
        fuelUsedPct: Number(fuelUsedPct.toFixed(1)),
        fuelPerHour: engineHours > 0 ? Number((fuelUsedPct / engineHours).toFixed(3)) : null,
        distanceKm: Number((engineHours * rng.float(0.2, 1.4)).toFixed(3)),
        maxTempC: Number(rng.clampedGauss(92, 5, 70, 104).toFixed(1)),
        avgTempC: Number(rng.clampedGauss(74, 6, 40, 95).toFixed(1)),
        nightMoveMin: rng.bool(0.03) ? rng.int(10, 60) : 0,
        offSiteMin: rng.bool(0.05) ? rng.int(10, 120) : 0,
        sampleCount: 144,
        hasOperator: b.operatorId !== null,
      });
    }
  }

  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.dailyUsage.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
  }
  step(`dailyUsage — ${rows.length.toLocaleString()} rows (${derived.length.toLocaleString()} derived from real ticks)`);
}

// ─────────────────────────────────────────── equipment status + checks
async function reconcile(bookings: Awaited<ReturnType<typeof seedBookings>>) {
  const out = bookings.filter((b) => b.status === "CHECKED_OUT").map((b) => b.equipmentId);
  const reserved = bookings
    .filter((b) => b.status === "CONFIRMED" && b.startDate > TODAY)
    .map((b) => b.equipmentId);

  await prisma.equipment.updateMany({ where: { id: { in: out } }, data: { status: "CHECKED_OUT" } });
  await prisma.equipment.updateMany({
    where: { id: { in: reserved.filter((id) => !out.includes(id)) } },
    data: { status: "RESERVED" },
  });

  // A couple of machines in the shop, so the status donut is not two colours.
  const idle = await prisma.equipment.findMany({ where: { status: "AVAILABLE" }, take: 3 });
  await prisma.equipment.updateMany({
    where: { id: { in: idle.slice(0, 2).map((e) => e.id) } },
    data: { status: "MAINTENANCE" },
  });

  // CheckEvents for bookings that actually moved, so the asset timeline has content.
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const events: Prisma.CheckEventCreateManyInput[] = [];
  for (const b of bookings) {
    if (b.checkoutAt) {
      events.push({
        bookingId: b.id, type: "CHECK_OUT", at: b.checkoutAt, scannedById: admin.id,
        lat: C.DEPOT.lat, lng: C.DEPOT.lng,
        meterHours: rng.float(200, 9000), fuelPct: rng.float(80, 100),
      });
    }
    if (b.checkinAt) {
      events.push({
        bookingId: b.id, type: "CHECK_IN", at: b.checkinAt, scannedById: admin.id,
        lat: C.DEPOT.lat, lng: C.DEPOT.lng,
        meterHours: rng.float(200, 9000), fuelPct: rng.float(15, 95),
        conditionNotes: rng.bool(0.2) ? rng.pick(["Minor hydraulic seepage", "Track tension low", "Cabin glass chipped", "Clean, no issues"]) : null,
      });
    }
  }
  const BATCH = 2000;
  for (let i = 0; i < events.length; i += BATCH) {
    await prisma.checkEvent.createMany({ data: events.slice(i, i + BATCH) });
  }
  step(`status + ${events.length.toLocaleString()} check events`);
}

// ─────────────────────────────────────────────────────────────── main
async function main() {
  console.log("\n🌱 Seeding Smart Rental Tracking\n");
  announceTarget();
  await reset();
  const { clients } = await seedUsers();
  const equipment = await seedEquipment();
  const { allSites, allOperators } = await seedSitesAndOperators(clients);
  const bookings = await seedBookings(equipment, clients, allSites, allOperators);
  const derived = await seedTelemetry(bookings, equipment);
  await seedDailyUsage(bookings, derived);
  await reconcile(bookings);

  const counts = {
    users: await prisma.user.count(),
    equipment: await prisma.equipment.count(),
    sites: await prisma.site.count(),
    operators: await prisma.operator.count(),
    bookings: await prisma.booking.count(),
    telemetry: await prisma.telemetry.count(),
    dailyUsage: await prisma.dailyUsage.count(),
    checkEvents: await prisma.checkEvent.count(),
  };

  console.log("\n📊 Seeded:");
  for (const [k, v] of Object.entries(counts)) {
    console.log(`     ${k.padEnd(12)} ${v.toLocaleString()}`);
  }
  console.log(`\n🔑 admin@rental.com / ${C.ADMIN.password}   (ADMIN)`);
  console.log(`   client@build.com / ${C.CLIENT_PASSWORD}   (CLIENT)`);
  console.log(`\n✅ done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
}

main()
  .catch((e) => {
    console.error("\n❌ seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
