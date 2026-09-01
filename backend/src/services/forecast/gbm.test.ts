import { describe, test, expect } from "bun:test";
import { buildFeatureRows } from "./features";
import { DEFAULT_GBM_PARAMS, fitGbm, gbmForecast, MIN_GBM_TRAINING_ROWS, predictGbm } from "./gbm";

const START = new Date("2026-01-01T00:00:00Z");

/** Pure weekly pattern, no noise, no trend — same reasoning as holtWinters.test.ts:
 * a GBM should learn this exactly given lag7 is one of its features. */
function weeklySeries(weeks: number): number[] {
  const pattern = [10, 20, 15, 12, 18, 25, 8];
  return Array.from({ length: weeks * 7 }, (_, t) => pattern[t % 7]!);
}

function flatContext(len: number) {
  return { activeCount: new Array(len).fill(3), avgDurationDays: new Array(len).fill(4) };
}

describe("fitGbm / predictGbm", () => {
  test("learns a pure weekly pattern well enough to reproduce it on training rows", () => {
    const y = weeklySeries(16); // 112 days, 84 feature rows once lag28 kicks in
    const ctx = flatContext(y.length);
    const rows = buildFeatureRows(y, ctx, START);
    const model = fitGbm(rows, { ...DEFAULT_GBM_PARAMS, nRounds: 80 });

    const meanAbsError =
      rows.reduce((s, r) => s + Math.abs(r.y - predictGbm(model, r)), 0) / rows.length;
    // lag7 alone would perfectly reproduce this series; boosting should get very close.
    expect(meanAbsError).toBeLessThan(1);
  });

  test("a constant series fits to that constant", () => {
    const y = new Array(60).fill(7);
    const ctx = flatContext(y.length);
    const rows = buildFeatureRows(y, ctx, START);
    const model = fitGbm(rows);
    for (const r of rows) expect(predictGbm(model, r)).toBeCloseTo(7, 1);
  });

  test("predictions are never negative even on a series that dips toward 0", () => {
    const y = Array.from({ length: 60 }, (_, i) => Math.max(0, 2 - (i % 7)));
    const ctx = flatContext(y.length);
    const rows = buildFeatureRows(y, ctx, START);
    const model = fitGbm(rows);
    for (const r of rows) expect(predictGbm(model, r)).toBeGreaterThanOrEqual(0);
  });
});

describe("gbmForecast", () => {
  test("forecasts the requested horizon", () => {
    const y = weeklySeries(16);
    const ctx = flatContext(y.length);
    const out = gbmForecast(y, ctx, START, 14);
    expect(out).toHaveLength(14);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
  });

  test("picks up the weekly shape: forecasted Saturday beats forecasted Sunday", () => {
    // weeklySeries starts at t=0=Jan 1 2026 (a Thursday); pattern index 5 (Sat=25) vs 6 (Sun=8).
    const y = weeklySeries(20);
    const ctx = flatContext(y.length);
    const out = gbmForecast(y, ctx, START, 14);
    expect(out[5]!).toBeGreaterThan(out[6]!);
  });

  test("falls back to a flat mean forecast below MIN_GBM_TRAINING_ROWS, rather than fitting on noise", () => {
    const y = weeklySeries(6); // 42 days -> only 14 feature rows, under the 20-row floor
    expect(buildFeatureRows(y, flatContext(y.length), START).length).toBeLessThan(MIN_GBM_TRAINING_ROWS);
    const ctx = flatContext(y.length);
    const out = gbmForecast(y, ctx, START, 5);
    const flat = out.every((v) => v === out[0]);
    expect(flat).toBe(true);
  });

  test("context held flat at its last known value across the forecast horizon (no future data fabricated)", () => {
    const y = weeklySeries(16);
    const ctx = { activeCount: new Array(y.length).fill(0), avgDurationDays: new Array(y.length).fill(0) };
    ctx.activeCount[ctx.activeCount.length - 1] = 9;
    // Two forecasts differing only in the context BEFORE the last known point
    // must be identical — only the tail value should matter to the horizon.
    const ctxA = { activeCount: [...ctx.activeCount], avgDurationDays: [...ctx.avgDurationDays] };
    const ctxB = { activeCount: [...ctx.activeCount], avgDurationDays: [...ctx.avgDurationDays] };
    ctxB.activeCount[0] = 500; // ancient history, should not matter to the horizon's own context read
    const outA = gbmForecast(y, ctxA, START, 5);
    const outB = gbmForecast(y, ctxB, START, 5);
    // Both should have used activeCount=9 (the last known value) for every horizon step.
    expect(outA).toEqual(outB);
  });
});
