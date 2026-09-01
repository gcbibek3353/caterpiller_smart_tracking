/**
 * Pure statistics helpers. Zero dependencies, zero DB access.
 * Owned by Person D — see steps.md §8/§9 and plan-24h.md D2.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

/** Median absolute deviation. */
export function mad(xs: number[]): number {
  const med = median(xs);
  return median(xs.map((x) => Math.abs(x - med)));
}

/**
 * Robust z-score using median/MAD instead of mean/std, so a handful of
 * extreme points can't inflate the spread they'd be measured against.
 * 0.6745 rescales MAD to be comparable to a standard deviation under
 * normality. |z| > 3.5 is the conventional outlier cutoff.
 */
export function robustZ(x: number, xs: number[]): number {
  const med = median(xs);
  const spread = mad(xs);
  return (0.6745 * (x - med)) / (spread || 1e-9);
}

/**
 * Exponentially weighted moving average. Returns the EWMA value at each
 * point in `xs`, seeded with the first observation.
 */
export function ewma(xs: number[], lambda = 0.2): number[] {
  const out: number[] = [];
  let prev: number | undefined;
  for (const x of xs) {
    prev = prev === undefined ? x : lambda * x + (1 - lambda) * prev;
    out.push(prev);
  }
  return out;
}

/** Mean absolute error between two equal-length series. */
export function mae(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(actual[i]! - predicted[i]!);
  return sum / n;
}

/**
 * Mean Absolute Scaled Error: MAE(model) / MAE(seasonal-naive on training).
 * < 1.0 means the model beats the seasonal-naive benchmark.
 * `naiveMae` is the in-sample MAE of the seasonal-naive forecaster.
 */
export function mase(actual: number[], predicted: number[], naiveMae: number): number {
  const modelMae = mae(actual, predicted);
  return modelMae / (naiveMae || 1e-9);
}

/** In-sample MAE of the seasonal-naive forecaster ŷ(t) = y(t-m), used as the MASE denominator. */
export function naiveInSampleMae(y: number[], m = 7): number {
  if (y.length <= m) return 0;
  let sum = 0;
  let n = 0;
  for (let t = m; t < y.length; t++) {
    sum += Math.abs(y[t]! - y[t - m]!);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** Symmetric MAPE — safe when actuals can be zero (raw MAPE explodes there). */
export function smape(actual: number[], predicted: number[]): number {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = actual[i]!;
    const p = predicted[i]!;
    const denom = (Math.abs(a) + Math.abs(p)) / 2;
    sum += denom === 0 ? 0 : Math.abs(a - p) / denom;
  }
  return sum / n;
}

/** Great-circle distance in km between two lat/lng points. */
export function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Standard deviation (population). */
export function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
