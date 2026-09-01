import type { BookingLike, SeriesKey } from "./types";

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
 * A booking counts toward demand if it isn't CANCELLED — PENDING/CONFIRMED/
 * CHECKED_OUT/RETURNED all represent real (or currently-live) rental demand.
 * This is the one place that rule lives; both the type-level and the
 * site-level series call it, so they can't drift apart.
 */
function isDemand(b: BookingLike): boolean {
  return b.status !== "CANCELLED";
}

/** `key.siteId === null` means "ignore site" (the company-wide series) — not "no site data." */
function matchesKey(b: BookingLike, key: SeriesKey): boolean {
  if (b.equipmentType !== key.equipmentType) return false;
  if (key.siteId !== null && b.siteId !== key.siteId) return false;
  return true;
}

/**
 * Daily demand series: for each day in [start, end] (inclusive), the number
 * of bookings matching `key` that were "on rent" that day (start <= day <=
 * end, excluding CANCELLED). Forecasting rental-days, not booking counts —
 * a 30-day booking and a 1-day booking are not the same demand.
 *
 * `key.siteId: null` builds the company-wide series for that equipment type
 * (every site pooled together); a real siteId scopes to just that site.
 */
export function buildDemandSeries(
  bookings: BookingLike[],
  key: SeriesKey,
  rangeStart: Date,
  rangeEnd: Date,
): number[] {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const numDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (numDays <= 0) return [];

  const relevant = bookings.filter((b) => matchesKey(b, key) && isDemand(b));

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

/**
 * Site-wide context per day, for the feature builder — independent of which
 * equipment type is being forecast. `key.siteId: null` pools every site
 * (company-wide context to go with a company-wide series).
 *
 * `activeCount[t]`: how many bookings of ANY type were on rent at this site
 * that day — a busy site tends to need more of everything, so this is a
 * genuinely different signal from the series' own lagged values, not a
 * duplicate of them.
 * `avgDurationDays[t]`: mean length of the bookings active that day — long
 * jobs vs. lots of short ones is its own pattern.
 */
export function buildSiteContext(
  bookings: BookingLike[],
  siteId: string | null,
  rangeStart: Date,
  rangeEnd: Date,
): { activeCount: number[]; avgDurationDays: number[] } {
  const start = startOfDay(rangeStart);
  const end = startOfDay(rangeEnd);
  const numDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (numDays <= 0) return { activeCount: [], avgDurationDays: [] };

  const relevant = bookings.filter(
    (b) => isDemand(b) && (siteId === null || b.siteId === siteId),
  );

  const activeCount = new Array<number>(numDays).fill(0);
  const durationSum = new Array<number>(numDays).fill(0);
  for (const b of relevant) {
    const bStart = startOfDay(b.startDate);
    const bEnd = startOfDay(b.endDate);
    const durationDays = Math.round((bEnd.getTime() - bStart.getTime()) / DAY_MS) + 1;
    const lo = Math.max(0, Math.round((bStart.getTime() - start.getTime()) / DAY_MS));
    const hi = Math.min(numDays - 1, Math.round((bEnd.getTime() - start.getTime()) / DAY_MS));
    for (let i = lo; i <= hi; i++) {
      if (i >= 0 && i < numDays) {
        activeCount[i]! += 1;
        durationSum[i]! += durationDays;
      }
    }
  }
  const avgDurationDays = activeCount.map((n, i) => (n > 0 ? durationSum[i]! / n : 0));
  return { activeCount, avgDurationDays };
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
