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

/** Minimal booking shape the series builder needs — matches the Prisma Booking model's relevant fields. */
export interface BookingLike {
  equipmentType: EquipmentType;
  startDate: Date;
  endDate: Date;
  status: "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
}

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
  weekStart: string;
  utilization: number;
  gapUnits: number;
  sentence: string;
}
