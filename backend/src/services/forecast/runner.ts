import type { EquipmentType, PrismaClient } from "@prisma/client";
import { rollingOriginBacktest } from "./backtest";
import { MIN_GBM_TRAINING_ROWS, gbmForecast } from "./gbm";
import { gridSearchHoltWinters, holtWinters } from "./holtWinters";
import { predictionIntervals } from "./intervals";
import { buildRecommendation, isColdStart } from "./recommend";
import { seasonalNaive } from "./seasonalNaive";
import { addDays, buildDemandSeries, buildSiteContext, startOfWeekMonday, toWeekly } from "./series";
import type { BookingLike, ForecastPoint, ModelName, Recommendation, SeriesKey } from "./types";

/**
 * D6 (+ the site-level extension) — the Prisma-wired half of forecasting.
 * Everything in seasonalNaive.ts / holtWinters.ts / gbm.ts / backtest.ts /
 * intervals.ts / recommend.ts / features.ts is a pure function; this file is
 * the only place that talks to Prisma. Builds one series per (equipmentType,
 * siteId) key — `siteId: null` is the company-wide aggregate for that type —
 * runs all eligible models, picks the winner by backtested MASE independently
 * per series, and writes `DemandForecast` rows.
 */

const SEASON_LENGTH = 7;
const BACKTEST_HORIZON = 14;
const BACKTEST_STEP = 7;
/** Below this many days of history, don't even attempt a backtest — steps.md §8 Cold start. */
const MIN_HISTORY_FOR_BACKTEST = 2 * SEASON_LENGTH + BACKTEST_HORIZON + BACKTEST_STEP;
/** GBM needs its own 28-day lag burn-in on top of that before it's worth entering the contest. */
const MIN_HISTORY_FOR_GBM = 28 + MIN_GBM_TRAINING_ROWS + BACKTEST_HORIZON;

export interface RunForecastResult {
  equipmentType: EquipmentType;
  siteId: string | null;
  siteLabel?: string;
  model: ModelName;
  mase: number;
  lowConfidence: boolean;
  fleetSize: number;
  points: ForecastPoint[];
  recommendations: Recommendation[];
}

/**
 * The shared core: given a pre-loaded `bookings` list (already filtered to
 * one equipment type, siteId left in) and a `key`, build that key's series,
 * pick a model, and return the forecast — no DB access here, so this is easy
 * to unit-test against a handcrafted booking list if needed. `runForecastForType`
 * / `runForecastForSite` / `runForecastAll` below are the thin Prisma-facing
 * wrappers that fetch `bookings` and call this once per series.
 */
function forecastSeries(
  bookings: BookingLike[],
  key: SeriesKey,
  fleetSize: number,
  weeks: number,
  now: Date,
  siteLabel?: string,
): RunForecastResult | null {
  const relevant = bookings.filter(
    (b) => b.equipmentType === key.equipmentType && (key.siteId === null || b.siteId === key.siteId),
  );
  if (relevant.length === 0) return null;

  const earliestStart = relevant.reduce(
    (min, b) => (b.startDate < min ? b.startDate : min),
    relevant[0]!.startDate,
  );

  const daily = buildDemandSeries(bookings, key, earliestStart, now);
  const context = buildSiteContext(bookings, key.siteId, earliestStart, now);
  const historyDays = daily.length;
  const lowConfidence = isColdStart(historyDays);

  const horizonDays = weeks * 7;

  let model: ModelName = "seasonal-naive";
  let predicted: number[];
  let residualStdByHorizon: number[] = [0];
  let mase = 1;

  const canFitSeasonal = historyDays >= SEASON_LENGTH;
  const canBacktest = !lowConfidence && historyDays >= MIN_HISTORY_FOR_BACKTEST;
  const canTryGbm = canBacktest && historyDays >= MIN_HISTORY_FOR_GBM;

  if (canBacktest) {
    const best = gridSearchHoltWinters(daily, SEASON_LENGTH, BACKTEST_HORIZON);
    const hwParams = best?.params ?? { alpha: 0.3, beta: 0.05, gamma: 0.3 };
    const backtestOpts = { m: SEASON_LENGTH, horizon: BACKTEST_HORIZON, step: BACKTEST_STEP, minTrain: MIN_HISTORY_FOR_BACKTEST - BACKTEST_STEP };

    const candidates: { model: ModelName; predicted: number[]; residualStdByHorizon: number[]; mase: number }[] = [];

    const naiveBacktest = rollingOriginBacktest(daily, (train, h) => seasonalNaive(train, SEASON_LENGTH, h), backtestOpts);
    candidates.push({
      model: "seasonal-naive",
      predicted: seasonalNaive(daily, SEASON_LENGTH, horizonDays),
      residualStdByHorizon: naiveBacktest.residualStdByHorizon,
      mase: naiveBacktest.mase,
    });

    const hwBacktest = rollingOriginBacktest(daily, (train, h) => holtWinters(train, SEASON_LENGTH, hwParams, h), backtestOpts);
    candidates.push({
      model: "holt-winters",
      predicted: holtWinters(daily, SEASON_LENGTH, hwParams, horizonDays),
      residualStdByHorizon: hwBacktest.residualStdByHorizon,
      mase: hwBacktest.mase,
    });

    if (canTryGbm) {
      // Context has to be sliced to match each backtest origin's own training
      // window — closing over the FULL context and re-slicing by train.length
      // is what keeps this a drop-in fit for rollingOriginBacktest's generic
      // (train, h) => number[] signature without changing that function at all.
      const gbmBacktest = rollingOriginBacktest(
        daily,
        (train, h) => {
          const slicedContext = {
            activeCount: context.activeCount.slice(0, train.length),
            avgDurationDays: context.avgDurationDays.slice(0, train.length),
          };
          return gbmForecast(train, slicedContext, earliestStart, h);
        },
        backtestOpts,
      );
      candidates.push({
        model: "gbm-lag",
        predicted: gbmForecast(daily, context, earliestStart, horizonDays),
        residualStdByHorizon: gbmBacktest.residualStdByHorizon,
        mase: gbmBacktest.mase,
      });
    }

    // Lowest backtested MASE wins, full stop — run every eligible model,
    // always; the benchmark isn't optional (steps.md §8), and neither is
    // giving the new challenger a fair shot against it.
    const winner = candidates.reduce((best, c) => (c.mase < best.mase ? c : best));
    model = winner.model;
    predicted = winner.predicted;
    residualStdByHorizon = winner.residualStdByHorizon;
    mase = winner.mase;
  } else if (canFitSeasonal) {
    // Not enough history for an honest backtest yet — seasonal-naive only,
    // and flagged low-confidence (steps.md §8 Cold start).
    predicted = seasonalNaive(daily, SEASON_LENGTH, horizonDays);
  } else {
    predicted = new Array(horizonDays).fill(0);
  }

  const intervals = predictionIntervals(predicted, residualStdByHorizon);
  const weeklyPredicted = toWeekly(predicted, 7);
  const weeklyUpper = toWeekly(intervals.map((i) => i.upper), 7);
  const weeklyLower = toWeekly(intervals.map((i) => i.lower), 7);
  const capacity = fleetSize * 7;

  const points: ForecastPoint[] = [];
  const recommendations: Recommendation[] = [];
  const firstWeekStart = startOfWeekMonday(addDays(now, 7)); // next full week, not the partial current one

  for (let w = 0; w < weeklyPredicted.length; w++) {
    const periodStart = addDays(firstWeekStart, w * 7);
    const weekStart = periodStart.toISOString().slice(0, 10);
    points.push({
      periodStart: weekStart,
      horizonWeek: w + 1,
      predicted: weeklyPredicted[w]!,
      lower: weeklyLower[w]!,
      upper: weeklyUpper[w]!,
    });
    recommendations.push(
      buildRecommendation({
        equipmentType: key.equipmentType,
        siteId: key.siteId,
        siteLabel,
        weekStart,
        predictedWeeklyRentalDays: weeklyPredicted[w]!,
        upperWeeklyRentalDays: weeklyUpper[w]!,
        fleetSize,
      }),
    );
  }

  return {
    equipmentType: key.equipmentType,
    siteId: key.siteId,
    siteLabel,
    model,
    mase,
    lowConfidence,
    fleetSize,
    points,
    recommendations,
  };
}

/** Persist one series' forecast points as `DemandForecast` rows. */
async function persist(prisma: PrismaClient, result: RunForecastResult, now: Date) {
  if (result.points.length === 0) return;
  const capacity = result.fleetSize * 7;
  await prisma.demandForecast.createMany({
    data: result.points.map((p) => {
      const utilization = capacity === 0 ? 0 : p.predicted / capacity;
      const gapUnits = Math.ceil(p.upper / 7) - result.fleetSize;
      return {
        equipmentType: result.equipmentType,
        siteId: result.siteId,
        periodStart: new Date(p.periodStart),
        horizonWeek: p.horizonWeek,
        predicted: p.predicted,
        lower: p.lower,
        upper: p.upper,
        fleetSize: result.fleetSize,
        capacity,
        utilization,
        gapUnits,
        model: result.model,
        mase: result.mase,
        lowConfidence: result.lowConfidence,
        generatedAt: now,
      };
    }),
  });
}

async function loadBookingsForType(prisma: PrismaClient, equipmentType: EquipmentType): Promise<BookingLike[]> {
  const rows = await prisma.booking.findMany({
    where: { equipment: { type: equipmentType }, status: { not: "CANCELLED" } },
    select: { startDate: true, endDate: true, status: true, siteId: true },
  });
  return rows.map((b) => ({ equipmentType, ...b }));
}

/** Company-wide forecast for one equipment type (siteId: null) — the original D6 entry point, kept for the existing route/callers. */
export async function runForecastForType(
  prisma: PrismaClient,
  equipmentType: EquipmentType,
  weeks = 8,
  now: Date = new Date(),
): Promise<RunForecastResult | null> {
  const bookings = await loadBookingsForType(prisma, equipmentType);
  const fleetSize = await prisma.equipment.count({ where: { type: equipmentType, status: { not: "RETIRED" } } });
  const result = forecastSeries(bookings, { equipmentType, siteId: null }, fleetSize, weeks, now);
  if (result) await persist(prisma, result, now);
  return result;
}

/** One site's forecast for one equipment type. */
export async function runForecastForSite(
  prisma: PrismaClient,
  siteId: string,
  equipmentType: EquipmentType,
  weeks = 8,
  now: Date = new Date(),
): Promise<RunForecastResult | null> {
  const [bookings, fleetSize, site] = await Promise.all([
    loadBookingsForType(prisma, equipmentType),
    prisma.equipment.count({ where: { type: equipmentType, status: { not: "RETIRED" } } }),
    prisma.site.findUnique({ where: { id: siteId }, select: { name: true } }),
  ]);
  const result = forecastSeries(bookings, { equipmentType, siteId }, fleetSize, weeks, now, site?.name);
  if (result) await persist(prisma, result, now);
  return result;
}

/**
 * Every series worth forecasting: each equipment type company-wide, plus
 * every (site, type) pair that has ever had a booking. One `bookings` query
 * per type feeds both its company-wide run and all of its sites' runs,
 * rather than a query per site.
 */
export async function runForecastAll(
  prisma: PrismaClient,
  weeks = 8,
  now: Date = new Date(),
): Promise<RunForecastResult[]> {
  const present = await prisma.equipment.findMany({ distinct: ["type"], select: { type: true } });
  const results: RunForecastResult[] = [];

  for (const { type } of present) {
    const bookings = await loadBookingsForType(prisma, type);
    const fleetSize = await prisma.equipment.count({ where: { type, status: { not: "RETIRED" } } });

    const companyWide = forecastSeries(bookings, { equipmentType: type, siteId: null }, fleetSize, weeks, now);
    if (companyWide) {
      await persist(prisma, companyWide, now);
      results.push(companyWide);
    }

    const siteIds = [...new Set(bookings.map((b) => b.siteId).filter((id): id is string => id !== null))];
    if (siteIds.length === 0) continue;
    const sites = await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } });
    const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

    for (const siteId of siteIds) {
      const perSite = forecastSeries(bookings, { equipmentType: type, siteId }, fleetSize, weeks, now, siteNameById.get(siteId));
      if (perSite) {
        await persist(prisma, perSite, now);
        results.push(perSite);
      }
    }
  }

  return results;
}
