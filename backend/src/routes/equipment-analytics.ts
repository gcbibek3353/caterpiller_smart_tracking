import { Hono } from "hono";
import { z } from "zod";
import type { EngineState } from "@prisma/client";
import { prisma } from "../db";
import {
  assertCanSeeEquipment,
  getClientBookingWindow,
  type AuthUser,
} from "../lib/equipment-access";
import { BUCKET_SIZES, TIMESERIES_METRICS } from "@rental/shared";

const querySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  bucket: z.enum(BUCKET_SIZES).default("1h"),
  metric: z.enum(TIMESERIES_METRICS).default("fuel"),
});

const dateRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const equipmentAnalytics = new Hono();

async function guardEquipmentAccess(
  c: { get: (k: string) => unknown; json: (body: unknown, status?: number) => Response },
  equipmentId: string,
): Promise<boolean> {
  const user = c.get("user") as AuthUser | undefined;
  if (!user) {
    c.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, 401);
    return false;
  }
  const allowed = await assertCanSeeEquipment(user, equipmentId);
  if (!allowed) {
    c.json({ error: { code: "FORBIDDEN", message: "Access denied" } }, 403);
    return false;
  }
  return true;
}

function parseDateRange(from?: string, to?: string, defaultDays = 7) {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - defaultDays * 24 * 60 * 60_000);
  return { fromDate, toDate };
}

equipmentAnalytics.get("/:id/summary", async (c) => {
  const equipmentId = c.req.param("id");
  if (!(await guardEquipmentAccess(c, equipmentId))) return;

  const user = c.get("user") as AuthUser;
  const { fromDate, toDate } = parseDateRange(
    c.req.query("from"),
    c.req.query("to"),
    7,
  );

  const window = await getClientBookingWindow(user, equipmentId);
  const effectiveFrom = window
    ? new Date(Math.max(fromDate.getTime(), window.startDate.getTime()))
    : fromDate;
  const effectiveTo = window
    ? new Date(Math.min(toDate.getTime(), window.endDate.getTime()))
    : toDate;

  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    include: {
      bookings: {
        where: { status: "CHECKED_OUT" },
        take: 1,
        include: {
          site: true,
          operator: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!equipment) {
    return c.json({ error: { code: "NOT_FOUND", message: "Equipment not found" } }, 404);
  }

  const dailyRows = await prisma.dailyUsage.findMany({
    where: {
      equipmentId,
      date: { gte: effectiveFrom, lte: effectiveTo },
    },
  });

  const latestTick = await prisma.telemetry.findFirst({
    where: { equipmentId },
    orderBy: { ts: "desc" },
  });

  const totalRuntime = dailyRows.reduce((s, r) => s + r.workingHours, 0);
  const totalIdle = dailyRows.reduce((s, r) => s + r.idleHours, 0);
  const totalEngine = totalRuntime + totalIdle;
  const utilizationPct = totalEngine > 0 ? (totalRuntime / totalEngine) * 100 : 0;
  const fuelUsed = dailyRows.reduce((s, r) => s + r.fuelUsedPct, 0);
  const avgTemp =
    dailyRows.filter((r) => r.avgTempC != null).reduce((s, r) => s + (r.avgTempC ?? 0), 0) /
    (dailyRows.filter((r) => r.avgTempC != null).length || 1);

  const activeBooking = equipment.bookings[0];

  return c.json({
    data: {
      equipmentId: equipment.id,
      code: equipment.code,
      name: equipment.name,
      type: equipment.type,
      status: equipment.status,
      runtimeHours: round(totalRuntime),
      idleHours: round(totalIdle),
      utilizationPct: round(utilizationPct),
      fuelUsedPct: round(fuelUsed),
      avgTempC: round(avgTemp),
      currentFuelPct: latestTick?.fuelPct ?? 0,
      currentTempC: latestTick?.engineTempC ?? 0,
      currentEngineState: (latestTick?.engineState ?? "OFF") as EngineState,
      totalEngineHours: latestTick?.engineHours ?? equipment.meterHours,
      sampleCount: dailyRows.reduce((s, r) => s + r.sampleCount, 0),
      site: activeBooking?.site
        ? {
            id: activeBooking.site.id,
            name: activeBooking.site.name,
            lat: activeBooking.site.lat,
            lng: activeBooking.site.lng,
            radiusMeters: activeBooking.site.radiusMeters,
          }
        : undefined,
      operator: activeBooking?.operator ?? undefined,
      booking: activeBooking
        ? {
            id: activeBooking.id,
            code: activeBooking.code,
            startDate: activeBooking.startDate.toISOString(),
            endDate: activeBooking.endDate.toISOString(),
            status: activeBooking.status,
          }
        : undefined,
    },
  });
});

equipmentAnalytics.get("/:id/timeseries", async (c) => {
  const equipmentId = c.req.param("id");
  if (!(await guardEquipmentAccess(c, equipmentId))) return;

  const user = c.get("user") as AuthUser;
  const parsed = querySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    bucket: c.req.query("bucket") ?? "1h",
    metric: c.req.query("metric") ?? "fuel",
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      400,
    );
  }

  const { from, to, bucket, metric } = parsed.data;
  const { fromDate, toDate } = parseDateRange(from, to, 7);

  const window = await getClientBookingWindow(user, equipmentId);
  const effectiveFrom = window
    ? new Date(Math.max(fromDate.getTime(), window.startDate.getTime()))
    : fromDate;
  const effectiveTo = window
    ? new Date(Math.min(toDate.getTime(), window.endDate.getTime()))
    : toDate;

  const truncInterval =
    bucket === "10m" ? "10 minutes" : bucket === "1h" ? "1 hour" : "1 day";

  const valueColumn =
    metric === "fuel"
      ? "fuel_pct"
      : metric === "temp"
        ? "engine_temp_c"
        : metric === "engineHours"
          ? "engine_hours"
          : metric === "speed"
            ? "speed_kph"
            : "engine_state_ord";

  const rows = await prisma.$queryRawUnsafe<
    Array<{ bucket: Date; value: number; engine_state: string | null }>
  >(
    `
    SELECT
      date_trunc($1, ts AT TIME ZONE 'UTC') AS bucket,
      AVG(CASE
        WHEN $5 = 'fuel_pct' THEN "fuelPct"
        WHEN $5 = 'engine_temp_c' THEN "engineTempC"
        WHEN $5 = 'engine_hours' THEN "engineHours"
        WHEN $5 = 'speed_kph' THEN "speedKph"
        ELSE CASE "engineState" WHEN 'OFF' THEN 0 WHEN 'IDLE' THEN 1 ELSE 2 END
      END)::float AS value,
      mode() WITHIN GROUP (ORDER BY "engineState") AS engine_state
    FROM "Telemetry"
    WHERE "equipmentId" = $2
      AND ts >= $3
      AND ts <= $4
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    truncInterval,
    equipmentId,
    effectiveFrom,
    effectiveTo,
    valueColumn,
  );

  const data = rows.map((r) => ({
    ts: r.bucket.toISOString(),
    value: round(r.value),
    engineState: r.engine_state as EngineState | undefined,
  }));

  return c.json({ data });
});

equipmentAnalytics.get("/:id/track", async (c) => {
  const equipmentId = c.req.param("id");
  if (!(await guardEquipmentAccess(c, equipmentId))) return;

  const user = c.get("user") as AuthUser;
  const { fromDate, toDate } = parseDateRange(
    c.req.query("from"),
    c.req.query("to"),
    1,
  );

  const window = await getClientBookingWindow(user, equipmentId);
  const effectiveFrom = window
    ? new Date(Math.max(fromDate.getTime(), window.startDate.getTime()))
    : fromDate;
  const effectiveTo = window
    ? new Date(Math.min(toDate.getTime(), window.endDate.getTime()))
    : toDate;

  const ticks = await prisma.telemetry.findMany({
    where: {
      equipmentId,
      ts: { gte: effectiveFrom, lte: effectiveTo },
    },
    orderBy: { ts: "asc" },
    select: { lat: true, lng: true, ts: true },
  });

  return c.json({
    data: ticks.map((t) => ({
      lat: t.lat,
      lng: t.lng,
      ts: t.ts.toISOString(),
    })),
  });
});

equipmentAnalytics.get("/:id/daily", async (c) => {
  const equipmentId = c.req.param("id");
  if (!(await guardEquipmentAccess(c, equipmentId))) return;

  const user = c.get("user") as AuthUser;
  const parsed = dateRangeSchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });

  if (!parsed.success) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
      400,
    );
  }

  const { fromDate, toDate } = parseDateRange(parsed.data.from, parsed.data.to, 21);

  const window = await getClientBookingWindow(user, equipmentId);
  const effectiveFrom = window
    ? new Date(Math.max(fromDate.getTime(), window.startDate.getTime()))
    : fromDate;
  const effectiveTo = window
    ? new Date(Math.min(toDate.getTime(), window.endDate.getTime()))
    : toDate;

  const rows = await prisma.dailyUsage.findMany({
    where: {
      equipmentId,
      date: { gte: effectiveFrom, lte: effectiveTo },
    },
    orderBy: { date: "asc" },
  });

  return c.json({
    data: rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      engineHours: r.engineHours,
      workingHours: r.workingHours,
      idleHours: r.idleHours,
      idleRatio: r.idleRatio,
      fuelUsedPct: r.fuelUsedPct,
      avgTempC: r.avgTempC,
      distanceKm: r.distanceKm,
    })),
  });
});

function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Fleet analytics for admin dashboard */
export const fleetAnalytics = new Hono();

fleetAnalytics.get("/fleet", async (c) => {
  const user = c.get("user") as AuthUser | undefined;
  if (!user || user.role !== "ADMIN") {
    return c.json({ error: { code: "FORBIDDEN", message: "Admin only" } }, 403);
  }

  const [total, checkedOut, overdue, available, maintenance] = await Promise.all([
    prisma.equipment.count({ where: { status: { not: "RETIRED" } } }),
    prisma.equipment.count({ where: { status: "CHECKED_OUT" } }),
    prisma.booking.count({
      where: { status: "CHECKED_OUT", endDate: { lt: new Date() } },
    }),
    prisma.equipment.count({ where: { status: "AVAILABLE" } }),
    prisma.equipment.count({ where: { status: "MAINTENANCE" } }),
  ]);

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const usageRows = await prisma.dailyUsage.findMany({
    where: { date: { gte: last30 } },
    select: { workingHours: true, idleHours: true, engineHours: true },
  });

  const totalWorking = usageRows.reduce((s, r) => s + r.workingHours, 0);
  const totalEngine = usageRows.reduce((s, r) => s + r.engineHours, 0);
  const fleetUtilization = totalEngine > 0 ? (totalWorking / totalEngine) * 100 : 0;

  const revenueResult = await prisma.booking.aggregate({
    where: { status: "RETURNED", totalAmount: { not: null } },
    _sum: { totalAmount: true },
  });

  const statusCounts = await prisma.equipment.groupBy({
    by: ["status"],
    _count: { id: true },
    where: { status: { not: "RETIRED" } },
  });

  return c.json({
    data: {
      fleetUtilizationPct: round(fleetUtilization),
      machinesOut: checkedOut,
      totalMachines: total,
      overdueCount: overdue,
      availableCount: available,
      maintenanceCount: maintenance,
      revenue: Number(revenueResult._sum.totalAmount ?? 0),
      statusDistribution: statusCounts.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
    },
  });
});
