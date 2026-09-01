import { describe, test, expect } from "bun:test";
import { mean, median, mad, robustZ, ewma, mae, mase, naiveInSampleMae, smape, haversine, stddev } from "./stats";

describe("mean / median / mad", () => {
  test("mean of a simple series", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  test("median odd length", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  test("median even length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  test("mad of a constant series is 0", () => {
    expect(mad([5, 5, 5, 5])).toBe(0);
  });

  test("mad is resistant to a single huge outlier", () => {
    const withOutlier = mad([1, 2, 3, 4, 5, 1000]);
    // median is (3+4)/2=3.5; deviations mostly ~1-2.5, MAD stays small
    expect(withOutlier).toBeLessThan(3);
  });
});

describe("robustZ", () => {
  test("is 0 at the median", () => {
    const xs = [1, 2, 3, 4, 5];
    expect(robustZ(3, xs)).toBe(0);
  });

  test("flags a point far from a tight cluster", () => {
    const xs = [8, 9, 10, 10, 11, 9, 12, 10, 11]; // median 10, mad 1
    const z = robustZ(40, xs);
    expect(Math.abs(z)).toBeGreaterThan(3.5);
  });

  test("does not flag a normal point within a tight cluster", () => {
    const xs = [8, 9, 10, 10, 11, 9, 12, 10, 11]; // median 10, mad 1
    const z = robustZ(11, xs);
    expect(Math.abs(z)).toBeLessThan(3.5);
  });
});

describe("ewma", () => {
  test("seeds with the first value", () => {
    expect(ewma([5, 5, 5])[0]).toBe(5);
  });

  test("converges toward a step change", () => {
    const xs = [10, 10, 10, 10, 20, 20, 20, 20, 20, 20];
    const out = ewma(xs, 0.3);
    // should trend upward after the step, but not jump instantly
    expect(out[4]!).toBeGreaterThan(10);
    expect(out[4]!).toBeLessThan(20);
    expect(out[out.length - 1]!).toBeGreaterThan(out[4]!);
  });
});

describe("mae / mase / naiveInSampleMae", () => {
  test("mae is 0 for a perfect forecast", () => {
    expect(mae([1, 2, 3], [1, 2, 3])).toBe(0);
  });

  test("mae of a constant offset", () => {
    expect(mae([1, 2, 3], [2, 3, 4])).toBe(1);
  });

  test("mase < 1 means the model beats seasonal-naive", () => {
    // 3 weeks, weekly pattern + a steady +1/week trend, so seasonal-naive
    // (repeat last week) always errs by ~1 while a trend-aware model doesn't.
    const week = [10, 20, 15, 12, 18, 25, 8];
    const y = [...week, ...week.map((v) => v + 1), ...week.map((v) => v + 2)];
    const naive = naiveInSampleMae(y, 7);
    expect(naive).toBeCloseTo(1, 5);

    const actual = y.slice(14); // week 3
    const predicted = week.map((v) => v + 2); // trend-aware forecast, exact
    expect(mase(actual, predicted, naive)).toBeLessThan(1);
  });
});

describe("smape", () => {
  test("handles zero actuals without exploding", () => {
    expect(Number.isFinite(smape([0, 0, 5], [0, 1, 5]))).toBe(true);
  });
});

describe("haversine", () => {
  test("distance from a point to itself is 0", () => {
    expect(haversine({ lat: 27.7, lng: 85.3 }, { lat: 27.7, lng: 85.3 })).toBe(0);
  });

  test("known distance ballpark (roughly Kathmandu to Pokhara, ~130km)", () => {
    const d = haversine({ lat: 27.7172, lng: 85.324 }, { lat: 28.2096, lng: 83.9856 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(160);
  });
});

describe("stddev", () => {
  test("0 for a constant series", () => {
    expect(stddev([4, 4, 4])).toBe(0);
  });
});
