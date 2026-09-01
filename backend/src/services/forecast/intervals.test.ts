import { describe, test, expect } from "bun:test";
import { predictionIntervals } from "./intervals";

describe("predictionIntervals", () => {
  test("lower/upper straddle the prediction by z*sigma", () => {
    const out = predictionIntervals([10, 10], [2, 2], 1.28);
    expect(out[0]!.lower).toBeCloseTo(10 - 1.28 * 2, 5);
    expect(out[0]!.upper).toBeCloseTo(10 + 1.28 * 2, 5);
  });

  test("lower is clamped at 0", () => {
    const out = predictionIntervals([1], [10], 1.28);
    expect(out[0]!.lower).toBe(0);
  });

  test("reuses the last horizon's sigma once residualStdByHorizon runs out", () => {
    const out = predictionIntervals([5, 5, 5], [1], 1.28);
    expect(out[2]!.upper).toBeCloseTo(5 + 1.28 * 1, 5);
  });

  test("zero sigma collapses the interval to the point forecast", () => {
    const out = predictionIntervals([7], [0]);
    expect(out[0]!.lower).toBe(7);
    expect(out[0]!.upper).toBe(7);
  });
});
