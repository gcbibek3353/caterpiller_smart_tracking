import { Prisma } from "@prisma/client";

/**
 * `JSON.stringify` throws on BigInt — and `Telemetry.id` is a BigInt, so the
 * first person to return a raw telemetry row hits
 * "Do not know how to serialize a BigInt". Patch it once, here, rather than
 * having four people rediscover it separately.
 */
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

/**
 * Prisma `Decimal` serializes as a string ("450"), which silently turns into
 * `"450" * 2 === NaN` on the frontend. Money crosses the wire as a number.
 */
export const num = (d: Prisma.Decimal | number | null | undefined): number | null =>
  d === null || d === undefined ? null : typeof d === "number" ? d : d.toNumber();

/** Money fields on Equipment / Booking, converted for the wire. */
export const serializeEquipment = <T extends { dailyRate: unknown; hourlyRate?: unknown }>(e: T) => ({
  ...e,
  dailyRate: num(e.dailyRate as Prisma.Decimal),
  hourlyRate: num(e.hourlyRate as Prisma.Decimal | null),
});

export const serializeBooking = <T extends { dailyRate: unknown; totalAmount?: unknown }>(b: T) => ({
  ...b,
  dailyRate: num(b.dailyRate as Prisma.Decimal),
  totalAmount: num(b.totalAmount as Prisma.Decimal | null),
});

/** Standard paginated envelope body: `{ data: { items, total, page, limit } }`. */
export const paginated = <T>(items: T[], total: number, page: number, limit: number) => ({
  items,
  total,
  page,
  limit,
  pages: Math.max(1, Math.ceil(total / limit)),
});
