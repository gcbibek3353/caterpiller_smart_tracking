import { mean } from "../../lib/stats";
import { buildFeatureRowForDay, buildFeatureRows } from "./features";
import type { FeatureName, FeatureRow } from "./types";

/**
 * Gradient boosting, deliberately the simplest version that still earns the
 * name: shallow regression trees (depth ≤ `maxDepth`, a handful of leaves
 * each) as the weak learner, fit on residuals, added up with a small
 * learning rate. No deep learning, no external ML library — this is the
 * "second challenger" from the site-forecasting spec, sized to the amount
 * of data a single site×equipment-type series actually has (tens to a few
 * hundred rows), not to a library's defaults tuned for millions.
 */
export const FEATURE_NAMES: FeatureName[] = [
  "lag1",
  "lag7",
  "lag14",
  "lag28",
  "rollingAvg7",
  "rollingAvg28",
  "dayOfWeek",
  "month",
  "activeBookingCount",
  "avgRentalDurationDays",
];

function toVector(row: FeatureRow | Omit<FeatureRow, "y">): number[] {
  return FEATURE_NAMES.map((name) => row[name]);
}

type LeafNode = { kind: "leaf"; value: number };
type SplitNode = { kind: "split"; featureIndex: number; threshold: number; left: TreeNode; right: TreeNode };
type TreeNode = LeafNode | SplitNode;

function sse(values: number[], center: number): number {
  return values.reduce((s, v) => s + (v - center) ** 2, 0);
}

/**
 * One regression tree, greedily split on whichever (feature, threshold)
 * reduces sum-of-squared-error the most, up to `maxDepth`. `minLeafSize`
 * guards against a split that memorizes a single outlier row — with only
 * dozens of training rows per series, that's a real risk, not a theoretical
 * one.
 */
function buildTree(
  X: number[][],
  residuals: number[],
  depth: number,
  maxDepth: number,
  minLeafSize: number,
): TreeNode {
  if (depth >= maxDepth || X.length < minLeafSize * 2) {
    return { kind: "leaf", value: mean(residuals) };
  }

  let best: { featureIndex: number; threshold: number; sseTotal: number; leftIdx: number[]; rightIdx: number[] } | null = null;

  for (let f = 0; f < FEATURE_NAMES.length; f++) {
    const order = X.map((_, i) => i).sort((a, b) => X[a]![f]! - X[b]![f]!);
    for (let i = 1; i < order.length; i++) {
      const lo = X[order[i - 1]!]![f]!;
      const hi = X[order[i]!]![f]!;
      if (lo === hi) continue; // no real split point between equal values
      const leftIdx = order.slice(0, i);
      const rightIdx = order.slice(i);
      if (leftIdx.length < minLeafSize || rightIdx.length < minLeafSize) continue;

      const leftRes = leftIdx.map((idx) => residuals[idx]!);
      const rightRes = rightIdx.map((idx) => residuals[idx]!);
      const sseTotal = sse(leftRes, mean(leftRes)) + sse(rightRes, mean(rightRes));
      if (!best || sseTotal < best.sseTotal) {
        best = { featureIndex: f, threshold: (lo + hi) / 2, sseTotal, leftIdx, rightIdx };
      }
    }
  }

  if (!best) return { kind: "leaf", value: mean(residuals) };

  const leftX = best.leftIdx.map((i) => X[i]!);
  const leftY = best.leftIdx.map((i) => residuals[i]!);
  const rightX = best.rightIdx.map((i) => X[i]!);
  const rightY = best.rightIdx.map((i) => residuals[i]!);

  return {
    kind: "split",
    featureIndex: best.featureIndex,
    threshold: best.threshold,
    left: buildTree(leftX, leftY, depth + 1, maxDepth, minLeafSize),
    right: buildTree(rightX, rightY, depth + 1, maxDepth, minLeafSize),
  };
}

function predictTree(tree: TreeNode, x: number[]): number {
  let node = tree;
  while (node.kind === "split") {
    node = x[node.featureIndex]! <= node.threshold ? node.left : node.right;
  }
  return node.value;
}

export interface GbmParams {
  nRounds: number;
  learningRate: number;
  maxDepth: number;
  minLeafSize: number;
}

export const DEFAULT_GBM_PARAMS: GbmParams = {
  nRounds: 60,
  learningRate: 0.1,
  maxDepth: 2,
  minLeafSize: 3,
};

export interface GbmModel {
  baseline: number;
  trees: TreeNode[];
  learningRate: number;
}

/** Fit: start at the mean, then `nRounds` trees each nudging the prediction toward the residual. */
export function fitGbm(rows: FeatureRow[], params: GbmParams = DEFAULT_GBM_PARAMS): GbmModel {
  const X = rows.map(toVector);
  const y = rows.map((r) => r.y);
  const baseline = mean(y);
  let preds = new Array<number>(y.length).fill(baseline);
  const trees: TreeNode[] = [];

  for (let round = 0; round < params.nRounds; round++) {
    const residuals = y.map((yi, i) => yi - preds[i]!);
    const tree = buildTree(X, residuals, 0, params.maxDepth, params.minLeafSize);
    trees.push(tree);
    preds = preds.map((p, i) => p + params.learningRate * predictTree(tree, X[i]!));
  }

  return { baseline, trees, learningRate: params.learningRate };
}

export function predictGbm(model: GbmModel, row: Omit<FeatureRow, "y">): number {
  const x = toVector(row);
  const raw = model.baseline + model.trees.reduce((s, t) => s + model.learningRate * predictTree(t, x), 0);
  return Math.max(0, raw); // demand can't be negative
}

/** Minimum rows to even attempt a fit — below this, boosting a handful of stumps is just memorizing noise. */
export const MIN_GBM_TRAINING_ROWS = 20;

/**
 * Autoregressive h-step forecast: fit once on the history, then predict one
 * day at a time, feeding each prediction back in as the next day's lag1 (and
 * eventually lag7/14/28) — the same thing holtWinters.ts's iterative update
 * does, just via re-derived features instead of a smoothed state. Context
 * (activeBookingCount/avgRentalDuration) holds flat at its last known value
 * for the forecast horizon, same reasoning as `buildFeatureRowForDay`: there
 * is no future booking data to read it from honestly.
 */
export function gbmForecast(
  series: number[],
  context: { activeCount: number[]; avgDurationDays: number[] },
  rangeStart: Date,
  h: number,
  params: GbmParams = DEFAULT_GBM_PARAMS,
): number[] {
  const rows = buildFeatureRows(series, context, rangeStart);
  if (rows.length < MIN_GBM_TRAINING_ROWS) {
    return new Array(h).fill(mean(series) || 0);
  }

  const model = fitGbm(rows, params);
  const extended = [...series];
  const predictions: number[] = [];

  for (let step = 0; step < h; step++) {
    const t = extended.length;
    const featureRow = buildFeatureRowForDay(extended, context, rangeStart, t);
    const pred = predictGbm(model, featureRow);
    predictions.push(pred);
    extended.push(pred);
  }

  return predictions;
}
