import { describe, test, expect } from "bun:test";
import { detectStatisticalOutlier, detectEwmaDrift } from "./statistical";

describe("detectStatisticalOutlier", () => {
  const peers = [8, 9, 10, 10, 11, 9, 12, 10, 11]; // median 10, mad 1

  test("flags a value far outside the peer group", () => {
    const out = detectStatisticalOutlier("eq1", new Date("2026-01-01"), "engineHours", 40, peers);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("does not flag a value within the peer group's normal spread", () => {
    const out = detectStatisticalOutlier("eq1", new Date("2026-01-01"), "engineHours", 11, peers);
    expect(out).toHaveLength(0);
  });
});

describe("detectEwmaDrift", () => {
  test("does not flag with too few points", () => {
    const points = [1, 2, 3].map((v, i) => ({ date: new Date(2026, 0, i + 1), value: v }));
    expect(detectEwmaDrift("eq1", "fuelPerHour", points)).toHaveLength(0);
  });

  test("flags a slow drift away from the early baseline", () => {
    // starts at ~1.0, ramps steadily up past the baseline+3sigma band
    const values = [1, 1, 1, 1.1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
    const points = values.map((v, i) => ({ date: new Date(2026, 0, i + 1), value: v }));
    const out = detectEwmaDrift("eq1", "fuelPerHour", points);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("does not flag a flat, stable series", () => {
    const values = [2, 2.1, 1.9, 2, 2.05, 1.95, 2, 2.1, 1.9, 2];
    const points = values.map((v, i) => ({ date: new Date(2026, 0, i + 1), value: v }));
    expect(detectEwmaDrift("eq1", "fuelPerHour", points)).toHaveLength(0);
  });
});
