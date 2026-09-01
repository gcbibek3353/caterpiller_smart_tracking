import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { TelemetryIngestRequestSchema } from "../shared";
import { prisma } from "../db";
import { requireIngestApiKey } from "../middleware/ingest-auth";
import { rollupTelemetry } from "../services/rollup";

const telemetry = new Hono();

telemetry.post(
  "/ingest",
  requireIngestApiKey,
  zValidator("json", TelemetryIngestRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid telemetry payload",
            details: result.error.flatten(),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { ticks } = c.req.valid("json");

    const equipmentIds = [...new Set(ticks.map((t) => t.equipmentId))];
    const existing = await prisma.equipment.findMany({
      where: { id: { in: equipmentIds } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((e) => e.id));
    const unknown = equipmentIds.filter((id) => !validIds.has(id));

    if (unknown.length > 0) {
      return c.json(
        {
          error: {
            code: "UNKNOWN_EQUIPMENT",
            message: `Unknown equipment: ${unknown.join(", ")}`,
          },
        },
        400,
      );
    }

    const data = ticks.map((t) => ({
      equipmentId: t.equipmentId,
      bookingId: t.bookingId ?? null,
      ts: new Date(t.ts),
      lat: t.lat,
      lng: t.lng,
      engineState: t.engineState,
      engineHours: t.engineHours,
      fuelPct: t.fuelPct,
      engineTempC: t.engineTempC,
      ambientTempC: t.ambientTempC ?? null,
      speedKph: t.speedKph,
      operatorId: t.operatorId ?? null,
    }));

    const result = await prisma.telemetry.createMany({
      data,
      skipDuplicates: true,
    });

    return c.json({
      data: {
        inserted: result.count,
        skipped: ticks.length - result.count,
        total: ticks.length,
      },
    });
  },
);

/** Simulator helper — list CHECKED_OUT bookings with site info */
telemetry.get("/active-bookings", requireIngestApiKey, async (c) => {
  const bookings = await prisma.booking.findMany({
    where: { status: "CHECKED_OUT" },
    include: {
      equipment: { select: { id: true, code: true } },
      site: { select: { lat: true, lng: true, radiusMeters: true } },
      operator: { select: { id: true } },
    },
  });

  const data = bookings.map((b) => ({
    bookingId: b.id,
    equipmentId: b.equipmentId,
    equipmentCode: b.equipment.code,
    operatorId: b.operatorId ?? undefined,
    site: b.site
      ? {
          lat: b.site.lat,
          lng: b.site.lng,
          radiusMeters: b.site.radiusMeters,
        }
      : {
          lat: 12.9716,
          lng: 77.5946,
          radiusMeters: 500,
        },
  }));

  return c.json({ data });
});

export { telemetry };

/** Rollup job route — mounted separately at /api/jobs */
export const jobs = new Hono();

jobs.post("/rollup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const equipmentId = body.equipmentId as string | undefined;
  const from = body.from ? new Date(body.from) : undefined;
  const to = body.to ? new Date(body.to) : undefined;

  const result = await rollupTelemetry({ equipmentId, from, to });
  return c.json({ data: result });
});
