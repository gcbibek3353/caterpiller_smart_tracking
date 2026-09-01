import { z } from "zod";
import { BookingStatusSchema, IsoDateTime, Pagination } from "./common";

export const CreateBookingInput = z
  .object({
    equipmentId: z.string().min(1),
    startDate: IsoDateTime,
    endDate: IsoDateTime,
    siteId: z.string().min(1).optional(),
    operatorId: z.string().min(1).optional(),
    /** ADMIN may book on behalf of a client; CLIENT is forced to their own id. */
    clientId: z.string().min(1).optional(),
  })
  .refine((v) => v.startDate < v.endDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type CreateBookingInput = z.infer<typeof CreateBookingInput>;

/**
 * PATCH. Deliberately narrow: status may only move to CANCELLED here.
 * Every other transition goes through /confirm or the scan endpoints, so the
 * state machine lives in exactly one place.
 */
export const UpdateBookingInput = z
  .object({
    siteId: z.string().min(1).nullable().optional(),
    operatorId: z.string().min(1).nullable().optional(),
    endDate: IsoDateTime.optional(),
    status: z.literal(BookingStatusSchema.enum.CANCELLED).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field" });
export type UpdateBookingInput = z.infer<typeof UpdateBookingInput>;

export const BookingListQuery = Pagination.extend({
  status: BookingStatusSchema.optional(),
  equipmentId: z.string().optional(),
  /** ADMIN only; ignored for CLIENT, who always sees just their own. */
  clientId: z.string().optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  overdue: z.coerce.boolean().optional(),
  /**
   * "Due back within N days" — the /bookings Upcoming returns tab.
   *
   * Deliberately DISJOINT from `overdue`: a booking already past its grace day
   * is late, not upcoming, so the two filters partition the CHECKED_OUT set
   * rather than overlapping on the machines that matter most.
   */
  returningWithinDays: z.coerce.number().int().min(1).max(90).optional(),
});
export type BookingListQuery = z.infer<typeof BookingListQuery>;
