import { Hono } from "hono";
import { NotificationListQuery } from "../contracts/notification";
import { prisma } from "../db";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import type { AppEnv } from "../types";

export const notificationRoutes = new Hono<AppEnv>();

/**
 * D10's feed — "what you show on stage instead of opening a real mail
 * client." ADMIN sees every notification sent (the whole system's chatter);
 * CLIENT sees only their own, same rule as anomalies/bookings.
 */
notificationRoutes.get("/", requireAuth, validate("query", NotificationListQuery), async (c) => {
  const user = c.get("user");
  const q = valid(c, "query", NotificationListQuery);

  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.from || q.to) {
    where.createdAt = { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) };
  }
  if (user.role !== "ADMIN") where.userId = user.id;

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.notification.count({ where }),
  ]);

  return ok(c, { items, page: q.page, limit: q.limit, total });
});
