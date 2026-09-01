import type { EquipmentType, PrismaClient } from "@prisma/client";
import { rollingOriginBacktest } from "./backtest";
import { gridSearchHoltWinters, holtWinters } from "./holtWinters";
import { predictionIntervals } from "./intervals";
import { buildRecommendation, isColdStart } from "./recommend";
import { seasonalNaive } from "./seasonalNaive";
import { addDays, buildDemandSeries, startOfWeekMonday, toWeekly } from "./series";
import type { BookingLike, ForecastPoint, Recommendation } from "./types";

/**
 * D6 — the Prisma-wired half of forecasting. Everything in seasonalNaive.ts
 * / holtWinters.ts / backtest.ts / intervals.ts / recommend.ts is a pure
 * function over `number[]`; this file is the only place that talks to
 * Prisma. Builds the demand series from real bookings, runs both models,
 * picks the winner by backtested MASE, and writes `DemandForecast` rows.
 */

const SEASON_LENGTH = 7;
const BACKTEST_HORIZON = 14;
const BACKTEST_STEP = 7;

export interface RunForecastResult {
  equipmentType: EquipmentType;
  model: "holt-winters" | "seasonal-naive";
  mase: number;
  lowConfidence: boolean;
  fleetSize: number;
  points: ForecastPoint[];
  recommendations: Recommendation[];
}

export async function runForecastForType(
  prisma: PrismaClient,
  equipmentType: EquipmentType,
  weeks = 8,
  now: Date = new Date(),
): Promise<RunForecastResult | null> {
  const earliest = await prisma.booking.findFirst({
    where: { equipment: { type: equipmentType }, status: { not: "CANCELLED" } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  if (!earliest) return null; // nothing booked yet for this type — nothing to forecast from

  const bookingsRaw = await prisma.booking.findMany({
    where: { equipment: { type: equipmentType }, status: { not: "CANCELLED" } },
    select: { startDate: true, endDate: true, status: true },
  });
  const bookings: BookingLike[] = bookingsRaw.map((b) => ({ equipmentType, ...b }));

  const daily = buildDemandSeries(bookings, equipmentType, earliest.startDate, now);
  const historyDays = daily.length;
  const lowConfidence = isColdStart(historyDays);

  const fleetSize = await prisma.equipment.count({
    where: { type: equipmentType, status: { not: "RETIRED" } },
  });

  const horizonDays = weeks * 7;
  const minTrain = 2 * SEASON_LENGTH + BACKTEST_HORIZON;

  let model: "holt-winters" | "seasonal-naive" = "seasonal-naive";
  let predicted: number[];
  let residualStdByHorizon: number[] = [0];
  let mase = 1;

  const canFitSeasonal = historyDays >= SEASON_LENGTH;
  const canBacktest = !lowConfidence && historyDays >= minTrain + BACKTEST_STEP;

  if (canBacktest) {
    const best = gridSearchHoltWinters(daily, SEASON_LENGTH, BACKTEST_HORIZON);
    const hwParams = best?.params ?? { alpha: 0.3, beta: 0.05, gamma: 0.3 };

    const hwBacktest = rollingOriginBacktest(daily, (train, h) => holtWinters(train, SEASON_LENGTH, hwParams, h), {
      m: SEASON_LENGTH,
      horizon: BACKTEST_HORIZON,
      step: BACKTEST_STEP,
      minTrain,
    });
    const naiveBacktest = rollingOriginBacktest(daily, (train, h) => seasonalNaive(train, SEASON_LENGTH, h), {
      m: SEASON_LENGTH,
      horizon: BACKTEST_HORIZON,
      step: BACKTEST_STEP,
      minTrain,
    });

    // MASE is relative to seasonal-naive by construction, so "beats the
    // benchmark" is just mase < 1 — but only trust Holt-Winters over naive
    // if it's actually the lower-error one on this series (steps.md §8: run
    // both, always; the benchmark isn't optional).
    if (hwBacktest.mase < naiveBacktest.mase) {
      model = "holt-winters";
      predicted = holtWinters(daily, SEASON_LENGTH, hwParams, horizonDays);
      residualStdByHorizon = hwBacktest.residualStdByHorizon;
      mase = hwBacktest.mase;
    } else {
      predicted = seasonalNaive(daily, SEASON_LENGTH, horizonDays);
      residualStdByHorizon = naiveBacktest.residualStdByHorizon;
      mase = naiveBacktest.mase;
    }
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
        equipmentType,
        weekStart,
        predictedWeeklyRentalDays: weeklyPredicted[w]!,
        upperWeeklyRentalDays: weeklyUpper[w]!,
        fleetSize,
      }),
    );
  }

  if (points.length > 0) {
    await prisma.demandForecast.createMany({
      data: points.map((p) => {
        const utilization = capacity === 0 ? 0 : p.predicted / capacity;
        const gapUnits = Math.ceil(p.upper / 7) - fleetSize;
        return {
          equipmentType,
          periodStart: new Date(p.periodStart),
          horizonWeek: p.horizonWeek,
          predicted: p.predicted,
          lower: p.lower,
          upper: p.upper,
          fleetSize,
          capacity,
          utilization,
          gapUnits,
          model,
          mase,
          generatedAt: now,
        };
      }),
    });
  }

  return { equipmentType, model, mase, lowConfidence, fleetSize, points, recommendations };
}

export async function runForecastAll(
  prisma: PrismaClient,
  weeks = 8,
  now: Date = new Date(),
): Promise<RunForecastResult[]> {
  const present = await prisma.equipment.findMany({ distinct: ["type"], select: { type: true } });
  const results: RunForecastResult[] = [];
  for (const { type } of present) {
    const r = await runForecastForType(prisma, type, weeks, now);
    if (r) results.push(r);
  }
  return results;
}
