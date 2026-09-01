import type { EquipmentType } from "@prisma/client";
import { Rng } from "../../src/lib/random";
import { addDays, dayOfYear, utcDow } from "../../src/lib/dates";
import * as C from "./config";

/**
 * The demand model. This is the ground truth the forecaster is supposed to
 * rediscover, so it has to contain real, learnable structure:
 *
 *   trend  ×  annual seasonality  ×  weekday effect  ×  type shift  ×  noise
 *
 * If you flatten any of these, the forecast chart flattens with it and the
 * MASE badge stops meaning anything.
 */

const inDoyWindow = (doy: number, from: number, to: number) =>
  from <= to ? doy >= from && doy <= to : doy >= from || doy <= to;

/** Growth across the history window. */
export const trendFactor = (dayIndex: number, totalDays: number) =>
  1 + C.ANNUAL_TREND * (dayIndex / Math.max(1, totalDays));

/** Yearly construction cycle plus the monsoon trough. */
export const annualFactor = (d: Date) => {
  const doy = dayOfYear(d);
  const cycle =
    1 + C.ANNUAL_AMPLITUDE * Math.cos((2 * Math.PI * (doy - C.ANNUAL_PEAK_DOY)) / 365);
  const monsoon = inDoyWindow(doy, C.MONSOON.fromDoy, C.MONSOON.toDoy)
    ? C.MONSOON.multiplier
    : 1;
  return cycle * monsoon;
};

export const weekdayFactor = (d: Date) => C.WEEKDAY_WEIGHT[utcDow(d)] ?? 1;

/** Graders spike in road season — a shift in the type MIX, not just the level. */
export const typeFactor = (type: EquipmentType, d: Date) =>
  type === C.ROAD_SEASON.type &&
  inDoyWindow(dayOfYear(d), C.ROAD_SEASON.fromDoy, C.ROAD_SEASON.toDoy)
    ? C.ROAD_SEASON.multiplier
    : 1;

export type Spike = { start: Date; end: Date };

export const makeSpikes = (rng: Rng, from: Date, totalDays: number): Spike[] =>
  Array.from({ length: C.SPIKE_COUNT }, () => {
    const startIdx = rng.int(0, Math.max(0, totalDays - C.SPIKE_LENGTH_DAYS));
    const start = addDays(from, startIdx);
    return { start, end: addDays(start, C.SPIKE_LENGTH_DAYS) };
  });

export const spikeFactor = (d: Date, spikes: Spike[]) =>
  spikes.some((s) => d >= s.start && d <= s.end) ? C.SPIKE_MULTIPLIER : 1;

/** Expected number of bookings of `type` STARTING on day `d`. */
export const arrivalRate = (
  type: EquipmentType,
  fleetCount: number,
  d: Date,
  dayIndex: number,
  totalDays: number,
  spikes: Spike[],
  rng: Rng,
): number => {
  const base = C.BASE_ARRIVAL_RATE * fleetCount;
  const noise = Math.exp(rng.gauss(0, C.NOISE_SIGMA));
  return (
    base *
    trendFactor(dayIndex, totalDays) *
    annualFactor(d) *
    weekdayFactor(d) *
    typeFactor(type, d) *
    spikeFactor(d, spikes) *
    noise
  );
};

/** Rental length, drawn from the mixture in config. */
export const drawDuration = (rng: Rng): number => {
  const r = rng.next();
  let acc = 0;
  for (const band of C.DURATION_MIX) {
    acc += band.weight;
    if (r <= acc) return rng.int(band.min, band.max);
  }
  const last = C.DURATION_MIX[C.DURATION_MIX.length - 1]!;
  return rng.int(last.min, last.max);
};
