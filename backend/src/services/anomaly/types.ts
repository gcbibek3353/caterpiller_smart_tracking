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

/** Mirrors the Prisma DailyUsage model's relevant fields — one row per equipment per day. */
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
  bookingStatus?: "PENDING" | "CONFIRMED" | "CHECKED_OUT" | "RETURNED" | "CANCELLED";
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
