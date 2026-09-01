import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, notFound, ok } from "../lib/http";
import { paginated, serializeBooking } from "../lib/serialize";
import { assertCanSeeBooking, requireAuth } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import { BookingListQuery, CreateBookingInput, IdParam } from "../contracts";
import type { AppEnv, SessionUser } from "../types";

export const bookingRoutes = new Hono<AppEnv>();

bookingRoutes.use("*", requireAuth);

/**
 * A booking in one of these states occupies the machine for its window.
 * Kept identical to `routes/equipment.ts` on purpose: if this list and the
 * availability filter ever disagree, the catalogue offers a machine that
 * POST /api/bookings then refuses, which looks like a random 409 to the user.
 */
const BLOCKING_STATUSES: Prisma.EnumBookingStatusFilter["in"] = [
  "PENDING",
  "CONFIRMED",
  "CHECKED_OUT",
];

/**
 * Two closed ranges overlap iff  aStart <= bEnd  AND  bStart <= aEnd.
 *
 * Both bounds are INCLUSIVE, matching the availability filter in
 * `routes/equipment.ts` and the BOUNDARY cases pinned in `tests/a7.api.test.ts`:
 * a booking ending on the 20th collides with a request starting on the 20th,
 * because the machine is not back on the lot until that day is over.
 *
 * `excludeBookingId` is for PATCH, where the row being edited must not be
 * treated as a conflict with itself.
 */
const overlapWhere = (
  equipmentId: string,
  startDate: Date,
  endDate: Date,
  excludeBookingId?: string,
): Prisma.BookingWhereInput => ({
  equipmentId,
  status: { in: BLOCKING_STATUSES },
  startDate: { lte: endDate },
  endDate: { gte: startDate },
  ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
});

/** Opaque, revocable, no payload. The QR carries `RENT:v1:<token>` and nothing else. */
const newQrToken = () => randomBytes(32).toString("base64url");

/**
 * `code` is `@unique` and has no default, so it must be generated here.
 * Sequence is derived per-year; a collision under concurrency surfaces as P2002
 * and is retried by `createWithRetry` with a freshly counted sequence.
 */
async function nextBookingCode(): Promise<string> {
  const year = new Date().getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const count = await prisma.booking.count({ where: { createdAt: { gte: startOfYear } } });
  return `BK-${year}-${String(count + 1).padStart(6, "0")}`;
}

/** Prisma's code for "transaction failed due to a write conflict / deadlock". */
const SERIALIZATION_FAILURE = "P2034";
const UNIQUE_VIOLATION = "P2002";

// ── POST /api/bookings ────────────────────────────────────────────────
bookingRoutes.post("/", validate("json", CreateBookingInput), async (c) => {
  const body = valid(c, "json", CreateBookingInput);
  const user = c.get("user");

  // A CLIENT can only ever book for themselves; only an ADMIN may name a client.
  if (user.role !== "ADMIN" && body.clientId && body.clientId !== user.id) {
    throw badRequest("Clients cannot create bookings on behalf of another user");
  }
  const clientId = user.role === "ADMIN" ? (body.clientId ?? user.id) : user.id;

  const equipment = await prisma.equipment.findUnique({ where: { id: body.equipmentId } });
  if (!equipment) throw notFound("Equipment");
  if (equipment.status === "RETIRED" || equipment.status === "MAINTENANCE") {
    throw conflict(`${equipment.code} is ${equipment.status.toLowerCase()} and cannot be booked`);
  }

  const client = await prisma.user.findUnique({ where: { id: clientId } });
  if (!client) throw notFound("Client");

  // Optional FKs: fail with a clear message rather than a raw P2003 from the insert.
  if (body.siteId && !(await prisma.site.findUnique({ where: { id: body.siteId } }))) {
    throw notFound("Site");
  }
  if (body.operatorId && !(await prisma.operator.findUnique({ where: { id: body.operatorId } }))) {
    throw notFound("Operator");
  }

  /**
   * The check-then-insert below is a classic race: two requests can both see a
   * free window and both insert. Serializable isolation makes Postgres track the
   * overlap predicate and abort the loser with 40001 (Prisma P2034), which the
   * retry loop turns into a second attempt — and, on the retry, a real 409.
   *
   * A DB-level exclusion constraint would be stronger, but that needs a schema
   * change and only A edits schema.prisma.
   */
  const attempt = async () =>
    prisma.$transaction(
      async (tx) => {
        const clash = await tx.booking.findFirst({
          where: overlapWhere(body.equipmentId, body.startDate, body.endDate),
          select: { id: true, code: true, startDate: true, endDate: true, status: true },
          orderBy: { startDate: "asc" },
        });

        if (clash) {
          throw conflict(
            `${equipment.code} is already booked from ` +
              `${clash.startDate.toISOString().slice(0, 10)} to ` +
              `${clash.endDate.toISOString().slice(0, 10)} (${clash.code}). ` +
              `Pick a window that does not overlap.`,
            {
              equipmentId: body.equipmentId,
              conflictingBooking: {
                id: clash.id,
                code: clash.code,
                status: clash.status,
                startDate: clash.startDate,
                endDate: clash.endDate,
              },
            },
          );
        }

        return tx.booking.create({
          data: {
            code: await nextBookingCode(),
            equipmentId: body.equipmentId,
            clientId,
            siteId: body.siteId ?? null,
            operatorId: body.operatorId ?? null,
            startDate: body.startDate,
            endDate: body.endDate,
            status: "PENDING",
            // Required + @unique in the schema, so it cannot wait for /confirm as
            // steps.md §5 implies. Issuing it here is safe: the scan state machine
            // rejects a PENDING booking, so the token is inert until an admin
            // confirms. B5 may rotate it at confirm time.
            qrToken: newQrToken(),
            // Snapshot: a later price change must not rewrite an agreed booking.
            dailyRate: equipment.dailyRate,
          },
          include: {
            equipment: { select: { id: true, code: true, name: true, type: true, imageUrl: true } },
            client: { select: { id: true, name: true, companyName: true } },
            site: { select: { id: true, name: true } },
            operator: { select: { id: true, name: true } },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  let created;
  for (let i = 0; i < 3; i++) {
    try {
      created = await attempt();
      break;
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Retry only the two racy failures; a 409 from the overlap check is final.
      if ((code === SERIALIZATION_FAILURE || code === UNIQUE_VIOLATION) && i < 2) continue;
      throw err;
    }
  }
  if (!created) throw conflict("Could not reserve this window, please retry");

  // qrToken is deliberately withheld: it is issued to the client at /confirm.
  const { qrToken: _qrToken, ...safe } = created;
  return ok(c, serializeBooking(safe), 201);
});

// ── GET /api/bookings ─────────────────────────────────────────────────
bookingRoutes.get("/", validate("query", BookingListQuery), async (c) => {
  const q = valid(c, "query", BookingListQuery);
  const user = c.get("user");

  const where: Prisma.BookingWhereInput = {};

  /**
   * Role scoping, enforced in the route and not the UI (steps.md §3).
   * A CLIENT is pinned to their own id, so `?clientId=` from a client is
   * ignored rather than honoured — otherwise the filter is an enumeration hole.
   */
  if (user.role === "ADMIN") {
    if (q.clientId) where.clientId = q.clientId;
  } else {
    where.clientId = user.id;
  }

  if (q.status) where.status = q.status;
  if (q.equipmentId) where.equipmentId = q.equipmentId;

  // `from`/`to` select bookings that INTERSECT the window, not ones contained
  // by it — same inclusive-bounds rule as the overlap check above.
  if (q.from) where.endDate = { gte: q.from };
  if (q.to) where.startDate = { lte: q.to };

  // Still out with the return date behind us. Matches the [status, endDate] index.
  if (q.overdue) {
    where.status = "CHECKED_OUT";
    where.endDate = { ...(where.endDate as object), lt: new Date() };
  }

  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: [{ startDate: "desc" }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      include: {
        equipment: { select: { id: true, code: true, name: true, type: true, imageUrl: true } },
        client: { select: { id: true, name: true, companyName: true } },
        site: { select: { id: true, name: true } },
        operator: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  // qrToken never travels in a list response.
  const items = rows.map(({ qrToken: _qrToken, ...b }) => serializeBooking(b));
  return ok(c, paginated(items, total, q.page, q.limit));
});
