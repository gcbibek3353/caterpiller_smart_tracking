import type { BookingLike, EquipmentType } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function toISODate(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

/** Monday of the week containing `d` — `DemandForecast.periodStart` is always a Monday (steps.md §2). */
export function startOfWeekMonday(d: Date): Date {
  const day = startOfDay(d).getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (day + 6) % 7;
  return addDays(startOfDay(d), -daysSinceMonday);
}

/**
 * Daily demand series: for each day in [start, end] (inclusive), the number
 * of bookings of `type` that were "on rent" that day (start <= day <= end,
 * excluding CANCELLED). Forecasting rental-days, not booking counts —
 * a 30-day booking and a 1-day booking are not the same demand.
 */
export function buildDemandSeries(
  bookings: BookingLike[],
  type: EquipmentType,
  rangeStart: Date,
  rangeEnd: Date,
): number[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const numDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (numDays <= 0) return [];

  const relevant = bookings.filter((b) => b.equipmentType === type && b.status !== "CANCELLED");

  const series = new Array<number>(numDays).fill(0);
  for (const b of relevant) {
    const bStart = startOfDay(b.startDate);
    const bEnd = startOfDay(b.endDate);
    const lo = Math.max(0, Math.round((bStart.getTime() - start.getTime()) / DAY_MS));
    const hi = Math.min(numDays - 1, Math.round((bEnd.getTime() - start.getTime()) / DAY_MS));
    for (let i = lo; i <= hi; i++) {
      if (i >= 0 && i < numDays) series[i]! += 1;
    }
  }
  return series;
}

/** Sum a daily series into weekly totals of `weekLen` days each, dropping a trailing partial week. */
export function toWeekly(daily: number[], weekLen = 7): number[] {
  const weeks = Math.floor(daily.length / weekLen);
  const out = new Array<number>(weeks).fill(0);
  for (let w = 0; w < weeks; w++) {
    let sum = 0;
    for (let i = 0; i < weekLen; i++) sum += daily[w * weekLen + i]!;
    out[w] = sum;
  }
  return out;
}
