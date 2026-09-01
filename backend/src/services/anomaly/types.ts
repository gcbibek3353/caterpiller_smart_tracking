export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type EngineState = "OFF" | "IDLE" | "WORKING";

/** One flagged candidate. The runner (Prisma-wired, added later) turns these into `Anomaly` rows keyed by dedupeKey. */
export interface AnomalyCandidate {
  type: string;
  severity: Severity;
  equipmentId: string;
  bookingId?: string | null;
  windowStart: Date;
  windowEnd: Date;
  metric?: string;
  value?: number;
  threshold?: number;
  message: string;
  dedupeKey: string;
}

/**
 * One row per equipment per day. Most fields are native `DailyUsage`
 * columns (verified against backend/prisma/schema.prisma). `bookingStatus`
 * and `siteId` are NOT columns on `DailyUsage` itself — they live on the
 * related `Booking` — so the runner must join/flatten them in, e.g.
 * `prisma.dailyUsage.findMany({ include: { booking: { select: { status: true, siteId: true } } } })`
 * then spread `booking.status`/`booking.siteId` onto each row before
 * calling these detectors.
 */
export interface DailyUsageLike {
  equipmentId: string;
  bookingId?: string | null;
  date: Date;
  engineHours: number;
  workingHours: number;
  idleHours: number;
  idleRatio: number;
  isOperatingDay: boolean;
  fuelUsedPct: number;
  fuelPerHour: number | null;
  hasOperator: boolean;
  /** Joined from `booking.status` — see class doc. */
  bookingStatus?: "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
  /** Joined from `booking.siteId` — see class doc. */
  siteId?: string | null;
}

/** Mirrors the Prisma Telemetry model's relevant fields — one 10-minute tick. */
export interface TelemetryLike {
  equipmentId: string;
  bookingId?: string | null;
  ts: Date;
  lat: number;
  lng: number;
  engineState: EngineState;
  fuelPct: number;
  engineTempC: number;
  speedKph: number;
}

export interface SiteLike {
  id: string;
  lat: number;
  lng: number;
  radiusMeters: number;
}

/** Mirrors the Prisma Booking model's relevant fields. */
export interface BookingRuleInput {
  id: string;
  equipmentId: string;
  status: "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
  endDate: Date;
}
