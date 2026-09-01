import { mean, mae } from "../../lib/stats";
import type { HoltWintersParams } from "./types";

/**
 * Initial additive seasonal components: for each position in the season,
 * average how far that day sits from its season's own mean, across as many
 * full seasons as are available. Centers the seasonal component near 0.
 */
export function initSeasonals(y: number[], m: number): number[] {
  const numSeasons = Math.floor(y.length / m);
  if (numSeasons < 1) return new Array(m).fill(0);

  const seasonAverages: number[] = [];
  for (let s = 0; s < numSeasons; s++) {
    seasonAverages.push(mean(y.slice(s * m, s * m + m)));
  }

  const seasonals = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let s = 0; s < numSeasons; s++) {
      sum += y[s * m + i]! - seasonAverages[s]!;
    }
    seasonals[i] = sum / numSeasons;
  }
  return seasonals;
}

/**
 * Holt-Winters additive triple exponential smoothing. Season length `m`,
 * forecasts `h` steps beyond the end of `y`. See steps.md §8 Step 2B.
 */
export function holtWinters(
  y: number[],
  m = 7,
  params: HoltWintersParams = { alpha: 0.3, beta: 0.05, gamma: 0.3 },
  h = 56,
): number[] {
  if (y.length < 2 * m) {
    throw new Error(`holtWinters needs at least ${2 * m} points (2 seasons), got ${y.length}`);
  }
  const { alpha: a, beta: b, gamma: g } = params;

  let level = mean(y.slice(0, m));
  let trend = (mean(y.slice(m, 2 * m)) - level) / m;
  const s = initSeasonals(y, m);

  for (let t = 0; t < y.length; t++) {
    const prevLevel = level;
    const si = t % m;
    level = a * (y[t]! - s[si]!) + (1 - a) * (level + trend);
    trend = b * (level - prevLevel) + (1 - b) * trend;
    s[si] = g * (y[t]! - level) + (1 - g) * s[si]!;
  }

  return Array.from({ length: h }, (_, k) =>
    Math.max(0, level + (k + 1) * trend + s[(y.length + k) % m]!),
  );
}

/** Grid points recommended in steps.md §8 Step 2B: {0.05 … 0.6}. */
export const HW_GRID = [0.05, 0.15, 0.3, 0.45, 0.6];

/**
 * Grid-search α/β/γ on a held-out tail of `y`, keep the best triple by MAE.
 * ~125 fits — milliseconds. Store the returned params so results are
 * reproducible (steps.md §8 Step 2B).
 */
export function gridSearchHoltWinters(
  y: number[],
  m = 7,
  holdout = 14,
): { params: HoltWintersParams; mae: number } | null {
  if (y.length < 2 * m + holdout) return null;
  const train = y.slice(0, y.length - holdout);
  const test = y.slice(y.length - holdout);

  let best: { params: HoltWintersParams; mae: number } | null = null;
  for (const alpha of HW_GRID) {
    for (const beta of HW_GRID) {
      for (const gamma of HW_GRID) {
        try {
          const predicted = holtWinters(train, m, { alpha, beta, gamma }, holdout);
          const error = mae(test, predicted);
          if (!best || error < best.mae) {
            best = { params: { alpha, beta, gamma }, mae: error };
          }
        } catch {
          // train too short for this m — skip
        }
      }
    }
  }
  return best;
}
