import { describe, test, expect } from "bun:test";
import { holtWinters, initSeasonals, gridSearchHoltWinters } from "./holtWinters";
import { seasonalNaive } from "./seasonalNaive";
import { rollingOriginBacktest } from "./backtest";

/**
 * Synthetic weekly-seasonal series with a linear upward trend. Deliberately
 * no noise on a period that doesn't divide 7: any such noise would be
 * unlearnable by a weekly-seasonal model and could accidentally favor
 * seasonal-naive on a given window by coincidence rather than by being
 * genuinely competitive — exactly the trap steps.md warns about when it
 * calls seasonal-naive "surprisingly hard to beat". With trend as the only
 * structure beyond the weekly pattern, Holt-Winters (which explicitly models
 * trend) should have a real, non-coincidental edge over naive (which just
 * repeats last week, hardcoding in one full week of trend lag).
 */
function syntheticSeries(weeks: number, trendPerWeek = 1.2): number[] {
  const weekPattern = [10, 20, 15, 12, 18, 25, 8];
  const y: number[] = [];
  for (let t = 0; t < weeks * 7; t++) {
    const trend = trendPerWeek * Math.floor(t / 7);
    y.push(weekPattern[t % 7]! + trend);
  }
  return y;
}

describe("initSeasonals", () => {
  test("returns m values that average close to 0", () => {
    const y = syntheticSeries(6);
    const s = initSeasonals(y, 7);
    expect(s.length).toBe(7);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    expect(Math.abs(avg)).toBeLessThan(1);
  });
});

describe("holtWinters", () => {
  test("forecasts the requested horizon, all non-negative", () => {
    const y = syntheticSeries(8);
    const out = holtWinters(y, 7, { alpha: 0.3, beta: 0.05, gamma: 0.3 }, 14);
    expect(out.length).toBe(14);
    for (const v of out) expect(v).toBeGreaterThanOrEqual(0);
  });

  test("throws with fewer than 2 seasons of data", () => {
    expect(() => holtWinters([1, 2, 3], 7)).toThrow();
  });

  test("picks up the weekly shape: forecasted Saturday (index 5, value ~25) beats forecasted Sunday (index 6, value ~8)", () => {
    const y = syntheticSeries(10);
    const out = holtWinters(y, 7, { alpha: 0.3, beta: 0.05, gamma: 0.3 }, 14);
    expect(out[5]!).toBeGreaterThan(out[6]!);
  });

  test("beats the seasonal-naive benchmark on a rolling-origin backtest (MASE < 1)", () => {
    const y = syntheticSeries(20);
    const hw = rollingOriginBacktest(y, (train, h) => holtWinters(train, 7, { alpha: 0.3, beta: 0.05, gamma: 0.3 }, h), {
      m: 7,
      horizon: 7,
      step: 7,
      minTrain: 42,
    });
    // naive hardcodes a full week of trend lag into every prediction; HW models
    // the trend directly, so it should win decisively, not just narrowly.
    expect(hw.mase).toBeLessThan(0.1);
  });
});

describe("gridSearchHoltWinters", () => {
  test("returns a params triple with mae no worse than the fixed default", () => {
    const y = syntheticSeries(12);
    const best = gridSearchHoltWinters(y, 7, 14);
    expect(best).not.toBeNull();
    const defaultForecast = holtWinters(y.slice(0, y.length - 14), 7, { alpha: 0.3, beta: 0.05, gamma: 0.3 }, 14);
    const defaultMae =
      defaultForecast.reduce((sum, p, i) => sum + Math.abs(p - y[y.length - 14 + i]!), 0) / 14;
    expect(best!.mae).toBeLessThanOrEqual(defaultMae + 1e-9);
  });

  test("returns null when there isn't enough data", () => {
    expect(gridSearchHoltWinters([1, 2, 3, 4, 5], 7, 14)).toBeNull();
  });
});

describe("seasonalNaive sanity (benchmark comparison)", () => {
  test("holtWinters MAE beats seasonalNaive MAE on trending seasonal data", () => {
    const y = syntheticSeries(12);
    const train = y.slice(0, y.length - 7);
    const actual = y.slice(y.length - 7);
    const hwPred = holtWinters(train, 7, { alpha: 0.3, beta: 0.05, gamma: 0.3 }, 7);
    const naivePred = seasonalNaive(train, 7, 7);
    const hwMae = actual.reduce((s, a, i) => s + Math.abs(a - hwPred[i]!), 0) / 7;
    const naiveMae = actual.reduce((s, a, i) => s + Math.abs(a - naivePred[i]!), 0) / 7;
    expect(hwMae).toBeLessThan(naiveMae);
  });
});
