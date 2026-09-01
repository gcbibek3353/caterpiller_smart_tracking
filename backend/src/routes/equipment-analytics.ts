import { Hono } from "hono";
import { z } from "zod";
import type { EngineState } from "@prisma/client";
import { prisma } from "../db";
import {
  assertCanSeeEquipment,
  getClientBookingWindow,
  type AuthUser,
} from "../lib/equipment-access";
import { num } from "../lib/serialize";
import { optionalAuth } from "../middleware/auth";
import type { AppEnv } from "../types";
import { BUCKET_SIZES, TIMESERIES_METRICS } from "../shared";

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

export const equipmentAnalytics = new Hono<AppEnv>();
// Replaces app.ts's old "dev stub auth" comment — real better-auth session,
// populated opportunistically; guardEquipmentAccess() below does the 401/403.
equipmentAnalytics.use("*", optionalAuth);

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

      /**
       * Identity and spec, for the header of the equipment detail page. It
       * used to have to fetch GET /api/equipment/:id as well just to draw the
       * photo and the make/model line — two round trips for one card.
       * `dailyRate` is a Prisma Decimal, so it goes through `num()` like every
       * other money field; sending the string makes `rate * days` NaN.
       */
      imageUrl: equipment.imageUrl,
      make: equipment.make,
      model: equipment.model,
      year: equipment.year,
      dailyRate: num(equipment.dailyRate) ?? 0,
      hourlyRate: num(equipment.hourlyRate),
      fuelCapacityL: equipment.fuelCapacityL,
      meterHours: equipment.meterHours,
      homeLat: equipment.homeLat,
      homeLng: equipment.homeLng,
      notes: equipment.notes,

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
            checkoutAt: activeBooking.checkoutAt?.toISOString() ?? null,
            checkinAt: activeBooking.checkinAt?.toISOString() ?? null,
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

  /**
   * `bucket` and `metric` are interpolated, not bound — deliberately.
   *
   * Both are zod enums, so the only values that reach here are the literals
   * below; there is no injection surface. Binding them instead is what broke:
   * `date_trunc($1, …)` plus an `AVG(CASE WHEN $5 = … )` column switch leaves
   * the result type dependent on a parameter, and against Neon's pooler that
   * surfaces as `ERROR: cached plan must not change result type` on the second
   * distinct metric. Only the actual data values are bound.
   */
  /**
   * `date_bin`, not `date_trunc` — `date_trunc` only takes a field name
   * ('hour', 'day'), so it cannot express a 10-minute stride at all. `date_bin`
   * buckets to an arbitrary interval from a fixed origin, which is exactly the
   * tick cadence the simulator emits on.
   */
  const stride: Record<typeof bucket, string> = {
    "10m": "10 minutes",
    "1h": "1 hour",
    "1d": "1 day",
  };

  const valueExpr: Record<typeof metric, string> = {
    fuel: '"fuelPct"',
    temp: '"engineTempC"',
    engineHours: '"engineHours"',
    speed: '"speedKph"',
    engineState: `CASE "engineState" WHEN 'OFF' THEN 0 WHEN 'IDLE' THEN 1 ELSE 2 END`,
  };

  const rows = await prisma.$queryRawUnsafe<
    Array<{ bucket: Date; value: number; engine_state: string | null }>
  >(
    `
    SELECT
      date_bin('${stride[bucket]}', ts AT TIME ZONE 'UTC', TIMESTAMP '2000-01-01') AS bucket,
      AVG(${valueExpr[metric]})::float AS value,
      mode() WITHIN GROUP (ORDER BY "engineState") AS engine_state
    FROM "Telemetry"
    WHERE "equipmentId" = $1
      AND ts >= $2
      AND ts <= $3
    GROUP BY bucket
    ORDER BY bucket ASC
    `,
    equipmentId,
    effectiveFrom,
    effectiveTo,
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

/**
 * C12 — check-out / check-in events for the asset timeline.
 *
 * The timeline interleaves these with D5's anomalies, which the page fetches
 * separately from `/api/anomalies?equipmentId=` (already role-scoped there).
 * Same booking-window clamp as the rest of this router: a CLIENT sees only
 * events inside their own rental, enforced here rather than in the UI.
 */
equipmentAnalytics.get("/:id/events", async (c) => {
  const equipmentId = c.req.param("id");
  if (!(await guardEquipmentAccess(c, equipmentId))) return;

  const user = c.get("user") as AuthUser;
  const { fromDate, toDate } = parseDateRange(c.req.query("from"), c.req.query("to"), 21);

  const window = await getClientBookingWindow(user, equipmentId);
  const effectiveFrom = window
    ? new Date(Math.max(fromDate.getTime(), window.startDate.getTime()))
    : fromDate;
  const effectiveTo = window
    ? new Date(Math.min(toDate.getTime(), window.endDate.getTime()))
    : toDate;

  const events = await prisma.checkEvent.findMany({
    where: {
      booking: { equipmentId },
      at: { gte: effectiveFrom, lte: effectiveTo },
    },
    orderBy: { at: "desc" },
    take: 100,
    include: {
      booking: { select: { code: true } },
      scannedBy: { select: { name: true } },
    },
  });

  return c.json({
    data: events.map((e) => ({
      id: e.id,
      type: e.type,
      at: e.at.toISOString(),
      bookingCode: e.booking.code,
      scannedBy: e.scannedBy.name,
      meterHours: e.meterHours,
      fuelPct: e.fuelPct,
      conditionNotes: e.conditionNotes,
    })),
  });
});

function round(n: number, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Fleet analytics for admin dashboard */
export const fleetAnalytics = new Hono<AppEnv>();
fleetAnalytics.use("*", optionalAuth);

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

  // "Requires attention" — the open anomalies worth a human glance right now,
  // most severe and most recent first. Frontend's fixture had this shape
  // (attentionItems) but nothing served it; equipmentCode lets the dashboard
  // link straight to the asset page without a second round-trip.
  const openAnomalies = await prisma.anomaly.findMany({
    where: { status: "OPEN" },
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: 6,
    include: { equipment: { select: { id: true, code: true } } },
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
      attentionItems: openAnomalies.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: `${a.type.replace(/_/g, " ")} — ${a.equipment.code}`,
        description: a.message,
        equipmentId: a.equipment.id,
        equipmentCode: a.equipment.code,
      })),
    },
  });
});
