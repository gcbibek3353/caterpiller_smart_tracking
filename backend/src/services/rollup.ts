import type { EngineState, Prisma } from "@prisma/client";
import { prisma } from "../db";

export interface RollupOptions {
  equipmentId?: string;
  from?: Date;
  to?: Date;
}

function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / 60_000;
}

export async function rollupTelemetry(options: RollupOptions = {}) {
  const where: Prisma.TelemetryWhereInput = {};
  if (options.equipmentId) where.equipmentId = options.equipmentId;
  if (options.from || options.to) {
    where.ts = {};
    if (options.from) where.ts.gte = options.from;
    if (options.to) where.ts.lte = options.to;
  }

  const ticks = await prisma.telemetry.findMany({
    where,
    orderBy: [{ equipmentId: "asc" }, { ts: "asc" }],
    include: {
      booking: { select: { id: true, siteId: true, operatorId: true, site: true } },
    },
  });

  const byKey = new Map<
    string,
    {
      equipmentId: string;
      date: Date;
      bookingId?: string;
      ticks: typeof ticks;
      site?: { lat: number; lng: number; radiusMeters: number } | null;
      hasOperator: boolean;
    }
  >();

  for (const tick of ticks) {
    const date = utcDateOnly(tick.ts);
    const key = `${tick.equipmentId}:${date.toISOString().slice(0, 10)}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        equipmentId: tick.equipmentId,
        date,
        bookingId: tick.bookingId ?? undefined,
        ticks: [],
        site: tick.booking?.site ?? null,
        hasOperator: !!tick.booking?.operatorId || !!tick.operatorId,
      };
      byKey.set(key, group);
    }
    group.ticks.push(tick);
    if (tick.bookingId) group.bookingId = tick.bookingId;
    if (tick.operatorId || tick.booking?.operatorId) group.hasOperator = true;
  }

  let upserted = 0;

  for (const group of byKey.values()) {
    const metrics = computeDailyMetrics(group.ticks, group.site);
    await prisma.dailyUsage.upsert({
      where: {
        equipmentId_date: {
          equipmentId: group.equipmentId,
          date: group.date,
        },
      },
      create: {
        equipmentId: group.equipmentId,
        bookingId: group.bookingId,
        date: group.date,
        ...metrics,
        hasOperator: group.hasOperator,
      },
      update: {
        bookingId: group.bookingId,
        ...metrics,
        hasOperator: group.hasOperator,
      },
    });
    upserted++;
  }

  return { upserted, groups: byKey.size };
}

function computeDailyMetrics(
  ticks: Array<{
    ts: Date;
    engineState: EngineState;
    engineHours: number;
    fuelPct: number;
    engineTempC: number;
    speedKph: number;
    lat: number;
    lng: number;
  }>,
  site?: { lat: number; lng: number; radiusMeters: number } | null,
) {
  let workingMinutes = 0;
  let idleMinutes = 0;
  let offMinutes = 0;
  let fuelStart = ticks[0]?.fuelPct ?? 0;
  let fuelEnd = ticks[ticks.length - 1]?.fuelPct ?? 0;
  let fuelUsedPct = 0;
  let distanceKm = 0;
  let nightMoveMin = 0;
  let offSiteMin = 0;
  const temps: number[] = [];

  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i]!;
    temps.push(tick.engineTempC);

    const stepMin =
      i < ticks.length - 1
        ? minutesBetween(tick.ts, ticks[i + 1]!.ts)
        : 10;

    switch (tick.engineState) {
      case "WORKING":
        workingMinutes += stepMin;
        break;
      case "IDLE":
        idleMinutes += stepMin;
        break;
      default:
        offMinutes += stepMin;
    }

    const hour = tick.ts.getUTCHours();
    if (tick.speedKph > 3 && (hour >= 22 || hour < 5)) {
      nightMoveMin += stepMin;
    }

    if (site) {
      const distM = haversineM(tick.lat, tick.lng, site.lat, site.lng);
      if (distM > site.radiusMeters) {
        offSiteMin += stepMin;
      }
    }

    if (i > 0) {
      const prev = ticks[i - 1]!;
      distanceKm += haversineM(prev.lat, prev.lng, tick.lat, tick.lng) / 1000;
      const fuelDrop = prev.fuelPct - tick.fuelPct;
      if (fuelDrop > 0 && fuelDrop < 50) fuelUsedPct += fuelDrop;
    }
  }

  const engineHours = (workingMinutes + idleMinutes) / 60;
  const workingHours = workingMinutes / 60;
  const idleHours = idleMinutes / 60;
  const idleRatio = engineHours > 0 ? idleHours / engineHours : 0;

  // Detect refuels (fuel increase) — don't count as usage
  for (let i = 1; i < ticks.length; i++) {
    if (ticks[i]!.fuelPct > ticks[i - 1]!.fuelPct + 10) {
      fuelStart = ticks[i]!.fuelPct;
    }
  }
  fuelUsedPct = Math.max(0, fuelStart - fuelEnd);
  if (fuelUsedPct === 0) {
    fuelUsedPct = ticks.reduce((acc, t, i) => {
      if (i === 0) return acc;
      const drop = ticks[i - 1]!.fuelPct - t.fuelPct;
      return drop > 0 && drop < 30 ? acc + drop : acc;
    }, 0);
  }

  return {
    engineHours: round(engineHours),
    workingHours: round(workingHours),
    idleHours: round(idleHours),
    idleRatio: round(idleRatio, 3),
    isOperatingDay: engineHours >= 0.5,
    fuelUsedPct: round(fuelUsedPct),
    fuelPerHour: engineHours > 0 ? round(fuelUsedPct / engineHours) : null,
    distanceKm: round(distanceKm, 2),
    maxTempC: temps.length ? Math.max(...temps) : null,
    avgTempC: temps.length ? round(temps.reduce((a, b) => a + b, 0) / temps.length) : null,
    nightMoveMin: Math.round(nightMoveMin),
    offSiteMin: Math.round(offSiteMin),
    sampleCount: ticks.length,
  };
}

function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
