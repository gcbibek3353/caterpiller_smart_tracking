import { createMiddleware } from "hono/factory";
import type { Role } from "@prisma/client";
import { auth } from "../lib/auth";
import { prisma } from "../db";
import { env } from "../env";
import { forbidden, unauthorized } from "../lib/http";
import type { AppEnv, SessionUser } from "../types";

/**
 * Populates `c.get("user")` from the better-auth session cookie.
 * 401s if there is no valid session. Use on every non-public route.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) throw unauthorized();

  c.set("user", session.user as unknown as SessionUser);
  c.set("sessionId", session.session.id);
  await next();
});

/** Populates the user if a session exists, but never rejects. For role-aware public reads. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (session?.user) {
    c.set("user", session.user as unknown as SessionUser);
    c.set("sessionId", session.session.id);
  }
  await next();
});

/** Chain after requireAuth: `app.use(requireAuth, requireRole("ADMIN"))`. */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw unauthorized();
    if (!roles.includes(user.role)) {
      throw forbidden(`This action requires the ${roles.join(" or ")} role`);
    }
    await next();
  });

/** Machine-to-machine auth for the simulator's ingest endpoint. */
export const requireApiKey = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.req.header("x-api-key");
  if (!key || key !== env.INGEST_API_KEY) {
    throw unauthorized("Invalid or missing x-api-key");
  }
  await next();
});

/**
 * Ownership guard for every asset-scoped read.
 *
 * ADMIN sees everything. A CLIENT sees a machine only if they have (or had) a
 * booking on it. Enforce this in the route, never in the UI — steps.md §3.
 */
export async function assertCanSeeEquipment(
  user: SessionUser,
  equipmentId: string,
): Promise<void> {
  if (user.role === "ADMIN") return;

  const booking = await prisma.booking.findFirst({
    where: {
      equipmentId,
      clientId: user.id,
      status: { not: "CANCELLED" },
    },
    select: { id: true },
  });

  if (!booking) {
    throw forbidden("You do not have a booking on this equipment");
  }
}

/** Same rule for a booking. Returns the booking so callers don't re-query. */
export async function assertCanSeeBooking(user: SessionUser, bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw forbidden("Booking not found or not visible to you");
  if (user.role !== "ADMIN" && booking.clientId !== user.id) {
    throw forbidden("This booking belongs to another client");
  }
  return booking;
}
