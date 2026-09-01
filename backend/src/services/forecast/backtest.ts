import { mae as maeFn, mase as maseFn, naiveInSampleMae, stddev } from "../../lib/stats";
import type { BacktestResult } from "./types";

export interface BacktestOptions {
  m?: number;
  /** How many days ahead each origin forecasts. */
  horizon?: number;
  /** How many days to slide the origin forward each iteration. */
  step?: number;
  /** Minimum training window before the first origin. */
  minTrain?: number;
}

/**
 * Rolling-origin backtest (steps.md §8 Step 3): train on [0..k], predict
 * [k+1..k+horizon], slide k forward by `step`, repeat until the series runs
 * out. Returns MAE, MASE against the seasonal-naive benchmark, and the
 * residual std per horizon step (for prediction intervals — error grows
 * with horizon).
 */
export function rollingOriginBacktest(
  y: number[],
  forecastFn: (train: number[], h: number) => number[],
  opts: BacktestOptions = {},
): BacktestResult {
  const m = opts.m ?? 7;
  const horizon = opts.horizon ?? 14;
  const step = opts.step ?? 7;
  const minTrain = opts.minTrain ?? 2 * m;

  const allActual: number[] = [];
  const allPredicted: number[] = [];
  const errorsByHorizon: number[][] = Array.from({ length: horizon }, () => []);

  for (let k = minTrain; k + horizon <= y.length; k += step) {
    const train = y.slice(0, k);
    const actual = y.slice(k, k + horizon);
    const predicted = forecastFn(train, horizon);
    for (let i = 0; i < horizon; i++) {
      allActual.push(actual[i]!);
      allPredicted.push(predicted[i]!);
      errorsByHorizon[i]!.push(actual[i]! - predicted[i]!);
    }
  }

  const naive = naiveInSampleMae(y, m);
  return {
    mae: maeFn(allActual, allPredicted),
    mase: maseFn(allActual, allPredicted, naive),
    residualStdByHorizon: errorsByHorizon.map((errs) => stddev(errs)),
  };
}
