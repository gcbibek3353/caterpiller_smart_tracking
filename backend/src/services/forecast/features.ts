import type { FeatureRow } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trailing mean of `series[from..to]` inclusive, both 0-indexed. */
function trailingMean(series: number[], upToExclusive: number, window: number): number {
  const from = Math.max(0, upToExclusive - window);
  const slice = series.slice(from, upToExclusive);
  if (slice.length === 0) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

/**
 * Feature rows for the GBM challenger — one per day, day `t` built ONLY from
 * `series[0..t-1]` and the context arrays' value AT `t` (activeCount/
 * avgDuration are "as of that day," not future-looking).
 *
 * Leakage guard by construction: every lag/rolling read stops at `t - 1`.
 * `features.test.ts` proves this rather than assuming it — it mutates
 * `series[t+1..]` and asserts the feature row for `t` is unchanged.
 *
 * Only emits rows from day 28 onward — lag28 has no real value before that,
 * and a fabricated 0 would look like a genuine "no demand" signal to the
 * model instead of "we don't know yet."
 */
export function buildFeatureRows(
  series: number[],
  context: { activeCount: number[]; avgDurationDays: number[] },
  rangeStart: Date,
): FeatureRow[] {
  const rows: FeatureRow[] = [];
  const MIN_LAG = 28;

  for (let t = MIN_LAG; t < series.length; t++) {
    const date = new Date(rangeStart.getTime() + t * DAY_MS);
    rows.push({
      y: series[t]!,
      lag1: series[t - 1]!,
      lag7: series[t - 7]!,
      lag14: series[t - 14]!,
      lag28: series[t - 28]!,
      rollingAvg7: trailingMean(series, t, 7),
      rollingAvg28: trailingMean(series, t, 28),
      dayOfWeek: date.getUTCDay(),
      month: date.getUTCMonth(),
      activeBookingCount: context.activeCount[t] ?? 0,
      avgRentalDurationDays: context.avgDurationDays[t] ?? 0,
    });
  }
  return rows;
}

/**
 * Same features, for a day beyond the end of `series` (i.e. an actual
 * forecast step) — used at prediction time once the model needs to score a
 * day that doesn't exist in the training series yet. `series` here must
 * already include any days already predicted earlier in the same horizon
 * loop (autoregressive lag1/7/14/28), so the caller appends each prediction
 * before asking for the next day's features.
 */
export function buildFeatureRowForDay(
  series: number[],
  context: { activeCount: number[]; avgDurationDays: number[] },
  rangeStart: Date,
  t: number,
): Omit<FeatureRow, "y"> {
  const date = new Date(rangeStart.getTime() + t * DAY_MS);
  return {
    lag1: series[t - 1] ?? 0,
    lag7: series[t - 7] ?? 0,
    lag14: series[t - 14] ?? 0,
    lag28: series[t - 28] ?? 0,
    rollingAvg7: trailingMean(series, t, 7),
    rollingAvg28: trailingMean(series, t, 28),
    dayOfWeek: date.getUTCDay(),
    month: date.getUTCMonth(),
    // No future booking data exists for a day being forecast — hold the
    // context flat at its last known value rather than pretending we know it.
    activeBookingCount: context.activeCount[context.activeCount.length - 1] ?? 0,
    avgRentalDurationDays: context.avgDurationDays[context.avgDurationDays.length - 1] ?? 0,
  };
}
