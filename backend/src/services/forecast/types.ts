export type EquipmentType =
  | "EXCAVATOR"
  | "CRANE"
  | "BULLDOZER"
  | "GRADER"
  | "LOADER"
  | "BACKHOE"
  | "DUMP_TRUCK"
  | "COMPACTOR"
  | "FORKLIFT";

/**
 * Minimal booking shape the series builder needs. `startDate`/`endDate`/
 * `status` are native `Booking` columns (verified against
 * backend/prisma/schema.prisma). `equipmentType` is NOT a column on
 * `Booking` — it lives on the related `Equipment` — so the runner must
 * join/flatten it in, e.g.
 * `prisma.booking.findMany({ include: { equipment: { select: { type: true } } } })`
 * then map `equipment.type` to `equipmentType` on each row.
 */
export interface BookingLike {
  /** Joined from `equipment.type` — see class doc. */
  equipmentType: EquipmentType;
  /** Native `Booking` column — no join needed, unlike `equipmentType`. */
  siteId: string | null;
  startDate: Date;
  endDate: Date;
  status: "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
}

/** Which series a forecast belongs to. `siteId: null` = company-wide, ignoring site entirely. */
export interface SeriesKey {
  equipmentType: EquipmentType;
  siteId: string | null;
}

export type ModelName = "seasonal-naive" | "holt-winters" | "gbm-lag";

/** One point forecast with an 80%-ish prediction interval. */
export interface ForecastPoint {
  /** ISO date (Monday) of the forecast week. */
  periodStart: string;
  horizonWeek: number; // 1..h
  predicted: number; // rental-days
  lower: number;
  upper: number;
}

export interface BacktestResult {
  mae: number;
  mase: number;
  /** Residual std per forecast horizon (1-indexed by day-ahead), used for prediction intervals. */
  residualStdByHorizon: number[];
}

export interface HoltWintersParams {
  alpha: number;
  beta: number;
  gamma: number;
}

export interface Recommendation {
  equipmentType: EquipmentType;
  /** null = company-wide. */
  siteId: string | null;
  weekStart: string;
  utilization: number;
  gapUnits: number;
  sentence: string;
}

/**
 * One row of engineered features for day `t`, built strictly from data at or
 * before `t` — the leakage guard lives in how these are computed
 * (features.ts), not in this shape. `y` is the label (that day's actual
 * demand), kept alongside the features it was built from for training.
 */
export interface FeatureRow {
  y: number;
  lag1: number;
  lag7: number;
  lag14: number;
  lag28: number;
  rollingAvg7: number;
  rollingAvg28: number;
  dayOfWeek: number; // 0=Sun..6=Sat
  month: number; // 0=Jan..11=Dec
  activeBookingCount: number;
  avgRentalDurationDays: number;
}

export type FeatureName = Exclude<keyof FeatureRow, "y">;
