import type { PrismaClient } from "@prisma/client";
import { runDailyRules } from "./daily";
import { detectGeofenceBreach, runRealtimeRules } from "./realtime";
import { runBookingRules } from "./booking";
import type { AnomalyCandidate, BookingRuleInput, DailyUsageLike, SiteLike, TelemetryLike } from "./types";

/**
 * D5 — the Prisma-wired half of anomaly detection. Everything in daily.ts /
 * realtime.ts / booking.ts is a pure function with no DB access; this file
 * is the only place that talks to Prisma. Loads windows, joins in the
 * fields the pure detectors need but that don't live on their own table
 * (see the doc comments on DailyUsageLike/BookingLike), calls the pure
 * functions, and de-dupes on insert via `dedupeKey` + `skipDuplicates` —
 * the same idiom the ingest endpoint uses (steps.md §9).
 */

export interface RunAnomalyRulesResult {
  scanned: number;
  created: number;
  candidates: AnomalyCandidate[];
}

function groupByEquipment<T extends { equipmentId: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.equipmentId);
    if (list) list.push(item);
    else map.set(item.equipmentId, [item]);
  }
  return map;
}

async function persist(prisma: PrismaClient, candidates: AnomalyCandidate[]): Promise<number> {
  if (candidates.length === 0) return 0;
  const result = await prisma.anomaly.createMany({
    data: candidates.map((cand) => ({
      type: cand.type,
      severity: cand.severity,
      equipmentId: cand.equipmentId,
      bookingId: cand.bookingId ?? null,
      windowStart: cand.windowStart,
      windowEnd: cand.windowEnd,
      metric: cand.metric ?? null,
      value: cand.value ?? null,
      threshold: cand.threshold ?? null,
      message: cand.message,
      dedupeKey: cand.dedupeKey,
    })),
    skipDuplicates: true, // idempotent re-run, same idiom as telemetry ingest
  });
  return result.count;
}

function defaultDailyWindow(now: Date): { from: Date; to: Date } {
  const to = now;
  const from = new Date(to);
  // 35 days covers the 28-day fuel-drift trailing window plus the 5-day
  // low-utilization window with room to spare.
  from.setDate(from.getDate() - 35);
  return { from, to };
}

export async function runDailyAnomalyRules(
  prisma: PrismaClient,
  opts: { from?: Date; now?: Date; equipmentId?: string } = {},
): Promise<RunAnomalyRulesResult> {
  const now = opts.now ?? new Date();
  const { from, to } = opts.from ? { from: opts.from, to: now } : defaultDailyWindow(now);

  const rows = await prisma.dailyUsage.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(opts.equipmentId && { equipmentId: opts.equipmentId }),
    },
    orderBy: [{ equipmentId: "asc" }, { date: "asc" }],
    include: { booking: { select: { status: true, siteId: true } } },
  });

  const shaped: DailyUsageLike[] = rows.map((r) => ({
    equipmentId: r.equipmentId,
    bookingId: r.bookingId,
    date: r.date,
    engineHours: r.engineHours,
    workingHours: r.workingHours,
    idleHours: r.idleHours,
    idleRatio: r.idleRatio,
    isOperatingDay: r.isOperatingDay,
    fuelUsedPct: r.fuelUsedPct,
    fuelPerHour: r.fuelPerHour,
    hasOperator: r.hasOperator,
    bookingStatus: r.booking?.status,
    siteId: r.booking?.siteId ?? null,
  }));

  const candidates: AnomalyCandidate[] = [];
  for (const group of groupByEquipment(shaped).values()) {
    candidates.push(...runDailyRules(group));
  }

  const created = await persist(prisma, candidates);
  return { scanned: rows.length, created, candidates };
}

export async function runRealtimeAnomalyRules(
  prisma: PrismaClient,
  opts: { sinceMinutes?: number; now?: Date; equipmentId?: string } = {},
): Promise<RunAnomalyRulesResult> {
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - (opts.sinceMinutes ?? 120) * 60_000);

  const ticks = await prisma.telemetry.findMany({
    where: {
      ts: { gte: since, lte: now },
      ...(opts.equipmentId && { equipmentId: opts.equipmentId }),
    },
    orderBy: [{ equipmentId: "asc" }, { ts: "asc" }],
  });

  const shaped: TelemetryLike[] = ticks.map((t) => ({
    equipmentId: t.equipmentId,
    bookingId: t.bookingId,
    ts: t.ts,
    lat: t.lat,
    lng: t.lng,
    engineState: t.engineState,
    fuelPct: t.fuelPct,
    engineTempC: t.engineTempC,
    speedKph: t.speedKph,
  }));

  const byEquipment = groupByEquipment(shaped);
  const equipmentIds = [...byEquipment.keys()];

  // Geofence needs a site, which lives on the equipment's active booking, not
  // on Telemetry itself — resolve it per equipment for the ones with ticks.
  const activeBookings = equipmentIds.length
    ? await prisma.booking.findMany({
        where: { equipmentId: { in: equipmentIds }, status: "CHECKED_OUT" },
        select: { equipmentId: true, site: true },
      })
    : [];
  const siteByEquipment = new Map<string, SiteLike>();
  for (const b of activeBookings) {
    if (b.site) siteByEquipment.set(b.equipmentId, b.site);
  }

  const candidates: AnomalyCandidate[] = [];
  for (const [equipmentId, group] of byEquipment) {
    candidates.push(...runRealtimeRules(group, now));
    const site = siteByEquipment.get(equipmentId);
    if (site) candidates.push(...detectGeofenceBreach(group, site));
  }

  const created = await persist(prisma, candidates);
  return { scanned: ticks.length, created, candidates };
}

export interface RunBookingAnomalyRulesResult extends RunAnomalyRulesResult {
  /** UPCOMING_RETURN is informational, not a real anomaly (steps.md §9) — never persisted to `Anomaly`. Route these to a RETURN_REMINDER notification instead. */
  upcomingReturns: AnomalyCandidate[];
}

export async function runBookingAnomalyRules(
  prisma: PrismaClient,
  opts: { now?: Date; equipmentId?: string } = {},
): Promise<RunBookingAnomalyRulesResult> {
  const now = opts.now ?? new Date();

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CHECKED_OUT",
      ...(opts.equipmentId && { equipmentId: opts.equipmentId }),
    },
    select: { id: true, equipmentId: true, status: true, endDate: true },
  });

  const shaped: BookingRuleInput[] = bookings;
  const all = runBookingRules(shaped, now);
  const anomalies = all.filter((c) => c.type !== "UPCOMING_RETURN");
  const upcomingReturns = all.filter((c) => c.type === "UPCOMING_RETURN");

  const created = await persist(prisma, anomalies);
  return { scanned: bookings.length, created, candidates: anomalies, upcomingReturns };
}

export async function runAllAnomalyRules(
  prisma: PrismaClient,
  opts: { now?: Date; equipmentId?: string } = {},
): Promise<RunBookingAnomalyRulesResult> {
  const [daily, realtime, booking] = await Promise.all([
    runDailyAnomalyRules(prisma, opts),
    runRealtimeAnomalyRules(prisma, opts),
    runBookingAnomalyRules(prisma, opts),
  ]);
  return {
    scanned: daily.scanned + realtime.scanned + booking.scanned,
    created: daily.created + realtime.created + booking.created,
    candidates: [...daily.candidates, ...realtime.candidates, ...booking.candidates],
    upcomingReturns: booking.upcomingReturns,
  };
}
