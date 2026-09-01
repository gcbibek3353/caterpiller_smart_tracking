import { Hono } from "hono";
import { AnomalyListQuery, RunAnomaliesInput, UpdateAnomalyInput } from "../contracts/anomaly";
import { prisma } from "../db";
import { forbidden, notFound, ok } from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import { runAllAnomalyRules, runBookingAnomalyRules, runDailyAnomalyRules, runRealtimeAnomalyRules } from "../services/anomaly/runner";
import type { AppEnv } from "../types";

export const anomalyRoutes = new Hono<AppEnv>();

/** Admin: all. Client: only anomalies on equipment they have/had a booking on (steps.md §3). */
anomalyRoutes.get("/", requireAuth, validate("query", AnomalyListQuery), async (c) => {
  const user = c.get("user");
  const q = valid(c, "query", AnomalyListQuery);

  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.severity) where.severity = q.severity;
  if (q.type) where.type = q.type;
  if (q.from || q.to) {
    where.detectedAt = { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) };
  }

  if (user.role === "ADMIN") {
    if (q.equipmentId) where.equipmentId = q.equipmentId;
  } else {
    const own = await prisma.booking.findMany({
      where: { clientId: user.id },
      select: { equipmentId: true },
    });
    const ownIds = [...new Set(own.map((b) => b.equipmentId))];
    where.equipmentId = q.equipmentId ? { in: ownIds.filter((id) => id === q.equipmentId) } : { in: ownIds };
  }

  const [rows, total] = await Promise.all([
    prisma.anomaly.findMany({
      where,
      orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: { equipment: { select: { code: true, name: true, type: true } } },
    }),
    prisma.anomaly.count({ where }),
  ]);

  // Flattened, not nested — the frontend table was reading equipmentId.slice(0,10)
  // for lack of anything better; a raw cuid fragment tells nobody which machine fired.
  const items = rows.map((r) => ({
    ...r,
    equipmentCode: r.equipment.code,
    equipmentName: r.equipment.name,
    equipmentType: r.equipment.type,
    equipment: undefined,
  }));

  return ok(c, { items, page: q.page, limit: q.limit, total });
});

/** Acknowledge / resolve / mark false-positive. An OPEN anomaly only ever moves forward. */
anomalyRoutes.patch("/:id", requireAuth, validate("json", UpdateAnomalyInput), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = valid(c, "json", UpdateAnomalyInput);

  const anomaly = await prisma.anomaly.findUnique({ where: { id } });
  if (!anomaly) throw notFound("Anomaly");

  if (user.role !== "ADMIN") {
    const booking = await prisma.booking.findFirst({
      where: { equipmentId: anomaly.equipmentId, clientId: user.id, status: { not: "CANCELLED" } },
      select: { id: true },
    });
    if (!booking) throw forbidden("You do not have a booking on this equipment");
  }

  const updated = await prisma.anomaly.update({ where: { id }, data: { status: body.status } });
  return ok(c, updated);
});

/** Manual trigger — steps.md §3: "every scheduled job also gets a manual POST trigger." */
anomalyRoutes.post("/run", requireAuth, requireRole("ADMIN"), validate("json", RunAnomaliesInput), async (c) => {
  const input = valid(c, "json", RunAnomaliesInput);
  const now = input.to ?? new Date();
  const opts = { now, from: input.from, equipmentId: input.equipmentId };

  const result =
    input.scope === "daily"
      ? await runDailyAnomalyRules(prisma, opts)
      : input.scope === "realtime"
        ? await runRealtimeAnomalyRules(prisma, opts)
        : input.scope === "booking"
          ? await runBookingAnomalyRules(prisma, opts)
          : await runAllAnomalyRules(prisma, opts);

  return ok(c, { scope: input.scope, scanned: result.scanned, created: result.created });
});
