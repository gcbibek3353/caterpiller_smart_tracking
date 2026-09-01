import { describe, test, expect } from "bun:test";
import { buildFeatureRowForDay, buildFeatureRows } from "./features";

const START = new Date("2026-01-01T00:00:00Z");

function series60(): number[] {
  // 60 days, deterministic but non-trivial: weekly pattern (0..6) + a slow drift.
  return Array.from({ length: 60 }, (_, i) => (i % 7) + Math.floor(i / 20));
}

function flatContext(len: number) {
  return { activeCount: new Array(len).fill(3), avgDurationDays: new Array(len).fill(4) };
}

describe("buildFeatureRows", () => {
  test("emits nothing before day 28 — lag28 has no real value yet", () => {
    const rows = buildFeatureRows(series60().slice(0, 20), flatContext(20), START);
    expect(rows).toHaveLength(0);
  });

  test("emits exactly series.length - 28 rows once there's enough history", () => {
    const y = series60();
    const rows = buildFeatureRows(y, flatContext(y.length), START);
    expect(rows).toHaveLength(y.length - 28);
  });

  test("lag1/7/14/28 read the correct historical offsets", () => {
    const y = series60();
    const rows = buildFeatureRows(y, flatContext(y.length), START);
    const row0 = rows[0]!; // day 28
    expect(row0.y).toBe(y[28]!);
    expect(row0.lag1).toBe(y[27]!);
    expect(row0.lag7).toBe(y[21]!);
    expect(row0.lag14).toBe(y[14]!);
    expect(row0.lag28).toBe(y[0]!);
  });

  test("dayOfWeek and month come from the calendar date, not the array index", () => {
    const y = series60();
    const rows = buildFeatureRows(y, flatContext(y.length), START);
    // day 28 = Jan 1 + 28 days = Jan 29, 2026, a Thursday (day 4).
    expect(rows[0]!.dayOfWeek).toBe(4);
    expect(rows[0]!.month).toBe(0); // January
  });

  test("LEAKAGE GUARD: mutating series[t+1..] never changes the feature row for t", () => {
    const y = series60();
    const rowsBefore = buildFeatureRows(y, flatContext(y.length), START);
    const targetRow = 5; // some day well within range
    const t = targetRow + 28;

    const mutated = [...y];
    // Corrupt every value strictly after t with an extreme, easy-to-detect value.
    for (let i = t + 1; i < mutated.length; i++) mutated[i] = 999_999;

    const rowsAfter = buildFeatureRows(mutated, flatContext(mutated.length), START);
    expect(rowsAfter[targetRow]).toEqual(rowsBefore[targetRow]);
  });

  test("LEAKAGE GUARD: activeBookingCount/avgRentalDuration at t is unaffected by context after t", () => {
    const y = series60();
    const ctx = flatContext(y.length);
    const rowsBefore = buildFeatureRows(y, ctx, START);

    const mutatedCtx = {
      activeCount: [...ctx.activeCount],
      avgDurationDays: [...ctx.avgDurationDays],
    };
    const t = 5 + 28;
    for (let i = t + 1; i < mutatedCtx.activeCount.length; i++) {
      mutatedCtx.activeCount[i] = 999;
      mutatedCtx.avgDurationDays[i] = 999;
    }
    const rowsAfter = buildFeatureRows(y, mutatedCtx, START);
    expect(rowsAfter[5]).toEqual(rowsBefore[5]);
  });

  test("rollingAvg7/28 only average the trailing window strictly before t", () => {
    const y = new Array(40).fill(0).map((_, i) => i); // 0,1,2,...39 — easy to hand-check
    const rows = buildFeatureRows(y, flatContext(y.length), START);
    const row = rows.find((_, i) => i + 28 === 30)!; // t = 30
    // rollingAvg7 over y[23..29] = mean(23..29) = 26
    expect(row.rollingAvg7).toBe(26);
    // rollingAvg28 over y[2..29] = mean(2..29) = 15.5
    expect(row.rollingAvg28).toBeCloseTo(15.5, 5);
  });
});

describe("buildFeatureRowForDay", () => {
  test("holds context flat at its last known value for a future day", () => {
    const y = series60();
    const ctx = { activeCount: [1, 2, 3], avgDurationDays: [4, 5, 6] };
    const row = buildFeatureRowForDay(y, ctx, START, y.length); // one day beyond the series
    expect(row.activeBookingCount).toBe(3); // last known, not extrapolated
    expect(row.avgRentalDurationDays).toBe(6);
  });

  test("lags for a day beyond the series still read from the (possibly appended) series array", () => {
    const y = [...series60(), 42]; // caller appended a just-made prediction at index 60
    const row = buildFeatureRowForDay(y, flatContext(y.length), START, 61);
    expect(row.lag1).toBe(42);
  });
});
