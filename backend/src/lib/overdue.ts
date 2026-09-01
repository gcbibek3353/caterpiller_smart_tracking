import type { BookingStatus } from "@prisma/client";

/**
 * When a CHECKED_OUT booking actually counts as late.
 *
 * `endDate` is stored at midnight UTC of the LAST rental day, and the
 * availability rule treats it as inclusive — a booking ending the 10th blocks
 * one starting the 10th. So the naive `now > endDate` fires at 00:01 on the
 * return morning, before the machine could physically be back, and the admin
 * board lights up every active rental as overdue. checklist.md calls this out
 * under "One semantic D needs to decide" and lands on `now > endDate + 1 day`;
 * that rule lives here so the list filter, the detail flag and the scanner
 * preview cannot drift apart.
 */
export const OVERDUE_GRACE_MS = 86_400_000;

/** The cutoff for a WHERE clause: a booking is late once `endDate` is before this. */
export const overdueCutoff = (now: Date = new Date()) =>
  new Date(now.getTime() - OVERDUE_GRACE_MS);

export const isBookingOverdue = (
  status: BookingStatus,
  endDate: Date,
  now: Date = new Date(),
) => status === "CHECKED_OUT" && endDate < overdueCutoff(now);

/**
 * Whole UTC days from today to the booking's last rental day.
 * `0` = due back today, `1` = tomorrow, negative = already past.
 *
 * Compared date-to-date rather than instant-to-instant, because `endDate` is
 * midnight UTC of the last rental day: a booking due "today" is 0 days out all
 * day, not 0.6 at breakfast and 0.1 by evening. Sent on every list row so the
 * UI can label a return without doing clock arithmetic mid-render — which
 * React's purity rule forbids, and which is how the two sides drifted apart on
 * `isOverdue` in the first place.
 */
export function daysUntilReturn(endDate: Date, now: Date = new Date()): number {
  const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((utcDay(endDate) - utcDay(now)) / 86_400_000);
}
