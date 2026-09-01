export interface IntervalPoint {
  predicted: number;
  lower: number;
  upper: number;
}

/**
 * ~80% prediction interval from per-horizon residual std (steps.md §8 Step 4).
 * lower = max(0, ŷ − 1.28σ_h); upper = ŷ + 1.28σ_h.
 */
export function predictionIntervals(
  predicted: number[],
  residualStdByHorizon: number[],
  z = 1.28,
): IntervalPoint[] {
  return predicted.map((p, i) => {
    const sigma = residualStdByHorizon[Math.min(i, residualStdByHorizon.length - 1)] ?? 0;
    return {
      predicted: p,
      lower: Math.max(0, p - z * sigma),
      upper: p + z * sigma,
    };
  });
}
