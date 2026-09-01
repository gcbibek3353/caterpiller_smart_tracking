import { ewma, mean, robustZ, stddev } from "../../lib/stats";
import { ANOMALY_CONFIG } from "./config";
import { dayBucket } from "./dedupe";
import type { AnomalyCandidate } from "./types";

/**
 * Layer 2 — statistical, unsupervised (steps.md §9). Build layer 1
 * completely before touching this; layer 1 covers 100% of the required
 * cases, this is the "smart" upgrade.
 */

/**
 * Robust z-score against a peer group (same equipment type, trailing 30
 * days). Uses median/MAD, not mean/std — the outliers being hunted are
 * exactly the points that would poison a mean and inflate a standard
 * deviation, hiding themselves.
 */
export function detectStatisticalOutlier(
  equipmentId: string,
  date: Date,
  metric: string,
  value: number,
  peerValues: number[],
): AnomalyCandidate[] {
  const { zThreshold } = ANOMALY_CONFIG.statisticalOutlier;
  const z = robustZ(value, peerValues);
  if (Math.abs(z) <= zThreshold) return [];
  return [
    {
      type: "STATISTICAL_OUTLIER",
      severity: "MEDIUM",
      equipmentId,
      windowStart: date,
      windowEnd: date,
      metric,
      value,
      threshold: zThreshold,
      message: `${metric}=${value.toFixed(2)} is a robust z of ${z.toFixed(2)} vs its peer group, on ${dayBucket(date)}`,
      dedupeKey: `STATISTICAL_OUTLIER:${equipmentId}:${metric}:${dayBucket(date)}`,
    },
  ];
}

/**
 * EWMA control chart on a machine's own metric (e.g. fuelPerHour) — catches
 * slow degradation (a developing leak, a clogging filter) that a fixed
 * threshold never sees. Flags when the current EWMA drifts more than 3σ
 * from an early baseline.
 */
export function detectEwmaDrift(
  equipmentId: string,
  metric: string,
  points: { date: Date; value: number }[],
): AnomalyCandidate[] {
  const { lambda, sigmaThreshold } = ANOMALY_CONFIG.ewmaControlChart;
  if (points.length < 8) return [];

  const values = points.map((p) => p.value);
  const ewmaSeries = ewma(values, lambda);
  // Control limits come from an initial in-control reference window, not the
  // whole series — a drifting series has an inflated overall spread that
  // would otherwise mask the very drift being measured against it.
  const baselineWindow = values.slice(0, Math.min(7, values.length));
  const baseline = mean(baselineWindow);
  const sigma = stddev(baselineWindow);
  if (sigma <= 0) return [];

  const lastIdx = ewmaSeries.length - 1;
  const lastEwma = ewmaSeries[lastIdx]!;
  const deviation = Math.abs(lastEwma - baseline);
  if (deviation <= sigmaThreshold * sigma) return [];

  const last = points[lastIdx]!;
  return [
    {
      type: "STATISTICAL_DRIFT",
      severity: "MEDIUM",
      equipmentId,
      windowStart: points[0]!.date,
      windowEnd: last.date,
      metric: `${metric}_ewma`,
      value: lastEwma,
      threshold: baseline + sigmaThreshold * sigma,
      message: `EWMA ${metric} drifted to ${lastEwma.toFixed(2)}, ${(deviation / sigma).toFixed(1)}σ from baseline ${baseline.toFixed(2)}, as of ${dayBucket(last.date)}`,
      dedupeKey: `STATISTICAL_DRIFT:${equipmentId}:${metric}:${dayBucket(last.date)}`,
    },
  ];
}
