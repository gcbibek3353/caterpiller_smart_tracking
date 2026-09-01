import type { Role } from "@prisma/client";
import { prisma } from "../db";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

/**
 * Admin sees all equipment. Client only if they have/had a booking.
 * Enforced server-side — never rely on UI hiding.
 */
export async function assertCanSeeEquipment(
  user: AuthUser,
  equipmentId: string,
): Promise<boolean> {
  if (user.role === "ADMIN") return true;

  const booking = await prisma.booking.findFirst({
    where: {
      equipmentId,
      clientId: user.id,
      status: { not: "CANCELLED" },
    },
    select: { id: true },
  });

  return !!booking;
}

export async function getClientBookingWindow(
  user: AuthUser,
  equipmentId: string,
): Promise<{ startDate: Date; endDate: Date } | null> {
  if (user.role === "ADMIN") return null;

  const booking = await prisma.booking.findFirst({
    where: {
      equipmentId,
      clientId: user.id,
      status: { in: ["CONFIRMED", "CHECKED_OUT", "RETURNED"] },
    },
    orderBy: { startDate: "desc" },
    select: { startDate: true, endDate: true },
  });

  return booking;
}
