import { ANOMALY_CONFIG } from "./config";
import { dayBucket } from "./dedupe";
import type { AnomalyCandidate, BookingRuleInput } from "./types";

/** Booking rules, run hourly (steps.md §9). Pure: no DB access. */

export function detectOverdue(booking: BookingRuleInput, now: Date): AnomalyCandidate[] {
  const { highSeverityAfterHours } = ANOMALY_CONFIG.overdue;
  if (booking.status !== "CHECKED_OUT" || now <= booking.endDate) return [];
  const hoursOverdue = (now.getTime() - booking.endDate.getTime()) / 3_600_000;
  const severity = hoursOverdue >= highSeverityAfterHours ? "HIGH" : "MEDIUM";
  return [
    {
      type: "OVERDUE",
      severity,
      equipmentId: booking.equipmentId,
      bookingId: booking.id,
      windowStart: booking.endDate,
      windowEnd: now,
      metric: "hoursOverdue",
      value: hoursOverdue,
      threshold: highSeverityAfterHours,
      message: `${hoursOverdue.toFixed(0)}h overdue as of ${now.toISOString()}`,
      dedupeKey: `OVERDUE:${booking.equipmentId}:${dayBucket(now)}`,
    },
  ];
}

/**
 * Informational, not a true anomaly (steps.md §9) — the runner should route
 * this to a `RETURN_REMINDER` notification rather than the `Anomaly` table.
 * Fires when `endDate` is ~3 or ~1 days out.
 */
export function detectUpcomingReturn(booking: BookingRuleInput, now: Date): AnomalyCandidate[] {
  const { daysBefore } = ANOMALY_CONFIG.upcomingReturn;
  if (booking.status !== "CHECKED_OUT") return [];
  const daysUntil = (booking.endDate.getTime() - now.getTime()) / 86_400_000;
  const matched = daysBefore.find((d) => Math.abs(daysUntil - d) < 0.5);
  if (matched === undefined) return [];
  return [
    {
      type: "UPCOMING_RETURN",
      severity: "LOW",
      equipmentId: booking.equipmentId,
      bookingId: booking.id,
      windowStart: now,
      windowEnd: booking.endDate,
      metric: "daysUntilReturn",
      value: daysUntil,
      threshold: matched,
      message: `Return due in ~${matched} day(s), on ${booking.endDate.toISOString().slice(0, 10)}`,
      dedupeKey: `UPCOMING_RETURN:${booking.equipmentId}:${dayBucket(booking.endDate)}:${matched}`,
    },
  ];
}

export function runBookingRules(bookings: BookingRuleInput[], now: Date): AnomalyCandidate[] {
  return bookings.flatMap((b) => [...detectOverdue(b, now), ...detectUpcomingReturn(b, now)]);
}
