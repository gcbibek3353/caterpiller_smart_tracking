import { describe, test, expect } from "bun:test";
import { rollingOriginBacktest } from "./backtest";
import { seasonalNaive } from "./seasonalNaive";

describe("rollingOriginBacktest", () => {
  test("a perfect forecaster scores mae 0 and mase 0", () => {
    const week = [10, 12, 9, 14, 11, 13, 8];
    const y = [...week, ...week, ...week, ...week, ...week];
    const perfectForecast = (_train: number[], h: number) => {
      // cheat: reconstruct exactly by repeating the known pattern
      return Array.from({ length: h }, (_, k) => week[k % 7]!);
    };
    const result = rollingOriginBacktest(y, perfectForecast, { m: 7, horizon: 7, step: 7, minTrain: 14 });
    expect(result.mae).toBe(0);
    expect(result.mase).toBe(0);
  });

  test("residualStdByHorizon has one entry per horizon step", () => {
    const week = [10, 12, 9, 14, 11, 13, 8];
    const y = [...week, ...week, ...week, ...week];
    const result = rollingOriginBacktest(y, (train, h) => seasonalNaive(train, 7, h), {
      m: 7,
      horizon: 7,
      step: 7,
      minTrain: 14,
    });
    expect(result.residualStdByHorizon.length).toBe(7);
  });

  test("seasonal-naive backtested against itself scores mase close to 1", () => {
    const week = [10, 12, 9, 14, 11, 13, 8];
    // repeat the pattern with a bit of noise so origins aren't degenerate
    const noise = [0, 1, -1, 2, -2, 0, 1];
    const y: number[] = [];
    for (let w = 0; w < 8; w++) {
      for (let i = 0; i < 7; i++) y.push(week[i]! + noise[(w + i) % 7]!);
    }
    const result = rollingOriginBacktest(y, (train, h) => seasonalNaive(train, 7, h), {
      m: 7,
      horizon: 7,
      step: 7,
      minTrain: 14,
    });
    expect(result.mase).toBeGreaterThan(0.5);
    expect(result.mase).toBeLessThan(1.5);
  });
});
