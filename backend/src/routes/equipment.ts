import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { conflict, notFound, ok } from "../lib/http";
import { paginated, serializeBooking, serializeEquipment } from "../lib/serialize";
import { requireAuth, requireRole } from "../middleware/auth";
import { validate, valid } from "../middleware/validate";
import {
  CreateEquipmentInput,
  EquipmentListQuery,
  IdParam,
  UpdateEquipmentInput,
} from "../contracts";
import type { AppEnv } from "../types";

export const equipmentRoutes = new Hono<AppEnv>();

/**
 * A booking in one of these states occupies the machine for its window.
 * RETURNED is excluded (the machine is physically back, possibly early) and so
 * is CANCELLED (it never happened).
 */
const BLOCKING_STATUSES: Prisma.EnumBookingStatusFilter["in"] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_OUT",
];

equipmentRoutes.use("*", requireAuth);

// ── GET /api/equipment ────────────────────────────────────────────────
equipmentRoutes.get("/", validate("query", EquipmentListQuery), async (c) => {
  const q = valid(c, "query", EquipmentListQuery);

  const where: Prisma.EquipmentWhereInput = {};

  if (q.type) where.type = q.type;

  // RETIRED is a soft delete — hide it unless explicitly asked for.
  if (q.status) where.status = q.status;
  else where.status = { not: "RETIRED" };

  if (q.q) {
    where.OR = [
      { code: { contains: q.q, mode: "insensitive" } },
      { name: { contains: q.q, mode: "insensitive" } },
      { make: { contains: q.q, mode: "insensitive" } },
      { model: { contains: q.q, mode: "insensitive" } },
    ];
  }

  if (q.availableFrom && q.availableTo) {
    /**
     * Two ranges overlap iff  aStart <= bEnd  AND  bStart <= aEnd.
     * Here a = the requested window, b = an existing booking. So a machine is
     * free when NO booking satisfies both halves — `none`, not `every`.
     *
     * Both bounds are inclusive: a booking ending on the 10th and a request
     * starting on the 10th DO collide, because the machine is not back on the
     * lot until that day is over.
     */
    where.bookings = {
      none: {
        status: { in: BLOCKING_STATUSES },
        startDate: { lte: q.availableTo },
        endDate: { gte: q.availableFrom },
      },
    };
    // A machine in the shop can't be promised for a future window either.
    if (!q.status) where.status = { notIn: ["RETIRED", "MAINTENANCE"] };
  }

  const [rows, total] = await Promise.all([
    prisma.equipment.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.equipment.count({ where }),
  ]);

  return ok(c, paginated(rows.map(serializeEquipment), total, q.page, q.limit));
});

// ── GET /api/equipment/:id ────────────────────────────────────────────
equipmentRoutes.get("/:id", validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);
  const user = c.get("user");

  const equipment = await prisma.equipment.findUnique({ where: { id } });
  if (!equipment) throw notFound("Equipment");

  const now = new Date();
  const activeBooking = await prisma.booking.findFirst({
    where: {
      equipmentId: id,
      status: { in: ["CONFIRMED", "CHECKED_OUT"] },
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: {
      site: { select: { id: true, name: true, lat: true, lng: true, radiusMeters: true } },
      operator: { select: { id: true, name: true, phone: true } },
      client: { select: { id: true, name: true, companyName: true } },
    },
    orderBy: { startDate: "desc" },
  });

  // A client may browse the catalogue, but must not learn who else rents what.
  const visibleBooking =
    activeBooking && (user.role === "ADMIN" || activeBooking.clientId === user.id)
      ? serializeBooking(activeBooking)
      : null;

  return ok(c, {
    ...serializeEquipment(equipment),
    isBusy: Boolean(activeBooking),
    activeBooking: visibleBooking,
  });
});

// ── POST /api/equipment ───────────────────────────────────────────────
equipmentRoutes.post(
  "/",
  requireRole("ADMIN"),
  validate("json", CreateEquipmentInput),
  async (c) => {
    const body = valid(c, "json", CreateEquipmentInput);
    // A duplicate `code` surfaces as P2002 → 409 DUPLICATE via the error middleware.
    const created = await prisma.equipment.create({ data: body });
    return ok(c, serializeEquipment(created), 201);
  },
);

// ── PATCH /api/equipment/:id ──────────────────────────────────────────
equipmentRoutes.patch(
  "/:id",
  requireRole("ADMIN"),
  validate("param", IdParam),
  validate("json", UpdateEquipmentInput),
  async (c) => {
    const { id } = valid(c, "param", IdParam);
    const body = valid(c, "json", UpdateEquipmentInput);
    const updated = await prisma.equipment.update({ where: { id }, data: body });
    return ok(c, serializeEquipment(updated));
  },
);

// ── DELETE /api/equipment/:id — soft delete ───────────────────────────
equipmentRoutes.delete("/:id", requireRole("ADMIN"), validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);

  // Refuse to retire a machine that is still out or promised to someone.
  const live = await prisma.booking.count({
    where: { equipmentId: id, status: { in: BLOCKING_STATUSES } },
  });
  if (live > 0) {
    throw conflict(`Cannot retire: ${live} active or upcoming booking(s) on this machine`);
  }

  const retired = await prisma.equipment.update({
    where: { id },
    data: { status: "RETIRED" },
  });
  return ok(c, serializeEquipment(retired));
});
