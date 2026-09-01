import { z } from "zod";

/** Engine states — matches Prisma `EngineState` enum */
export const ENGINE_STATES = ["OFF", "IDLE", "WORKING"] as const;
export type EngineState = (typeof ENGINE_STATES)[number];

/** Single telemetry tick (ingest payload item) */
export const TelemetryTickSchema = z.object({
  equipmentId: z.string().min(1),
  bookingId: z.string().optional(),
  ts: z.string().datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  engineState: z.enum(ENGINE_STATES),
  engineHours: z.number().min(0),
  fuelPct: z.number().min(0).max(100),
  engineTempC: z.number().min(-40).max(150),
  ambientTempC: z.number().optional(),
  speedKph: z.number().min(0).max(120),
  operatorId: z.string().optional(),
});

export type TelemetryTick = z.infer<typeof TelemetryTickSchema>;

export const TelemetryIngestRequestSchema = z.object({
  ticks: z.array(TelemetryTickSchema).min(1).max(500),
});

export type TelemetryIngestRequest = z.infer<typeof TelemetryIngestRequestSchema>;

export const TelemetryIngestResponseSchema = z.object({
  inserted: z.number().int().min(0),
  skipped: z.number().int().min(0),
  total: z.number().int().min(0),
});

export type TelemetryIngestResponse = z.infer<typeof TelemetryIngestResponseSchema>;

/** Timeseries bucket sizes */
export const BUCKET_SIZES = ["10m", "1h", "1d"] as const;
export type BucketSize = (typeof BUCKET_SIZES)[number];

export const TIMESERIES_METRICS = [
  "fuel",
  "temp",
  "engineHours",
  "speed",
  "engineState",
] as const;
export type TimeseriesMetric = (typeof TIMESERIES_METRICS)[number];

/** API response shapes */
export interface TimeseriesPoint {
  ts: string;
  value: number;
  engineState?: EngineState;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  ts: string;
}

export interface EquipmentSummary {
  equipmentId: string;
  code: string;
  name: string;
  type: string;
  status: string;
  runtimeHours: number;
  idleHours: number;
  utilizationPct: number;
  fuelUsedPct: number;
  avgTempC: number;
  currentFuelPct: number;
  currentTempC: number;
  currentEngineState: EngineState;
  totalEngineHours: number;
  sampleCount: number;
  site?: { id: string; name: string; lat: number; lng: number; radiusMeters: number };
  operator?: { id: string; name: string };
  booking?: {
    id: string;
    code: string;
    startDate: string;
    endDate: string;
    status: string;
  };
}

export interface DailyUsageRow {
  date: string;
  engineHours: number;
  workingHours: number;
  idleHours: number;
  idleRatio: number;
  fuelUsedPct: number;
  avgTempC: number | null;
  distanceKm: number;
}

/** Chart component prop types (handoff contract) */
export interface WorkingIdleBarPoint {
  date: string;
  workingHours: number;
  idleHours: number;
}

export interface UsageLinePoint {
  date: string;
  engineHours: number;
  movingAvg7d?: number;
}

export interface FuelAreaPoint {
  ts: string;
  fuelPct: number;
  isRefuel?: boolean;
}

export interface TempLinePoint {
  ts: string;
  engineTempC: number;
  engineState?: EngineState;
}

export interface EngineStateRibbonPoint {
  ts: string;
  engineState: EngineState;
}

/** Map component contract */
export interface MapGeofence {
  lat: number;
  lng: number;
  radiusMeters: number;
  label?: string;
}

export interface MapPosition {
  lat: number;
  lng: number;
  ts?: string;
}

export interface AssetMapProps {
  breadcrumb: MapPosition[];
  geofence?: MapGeofence;
  currentPosition?: MapPosition;
  height?: string;
}

/** Timeline event (events + anomalies interleaved) */
export interface TimelineEvent {
  id: string;
  ts: string;
  type: "check" | "usage" | "location" | "anomaly" | "alert";
  title: string;
  description?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
}

/** Simulator scenario flags */
export const SCENARIOS = [
  "idle",
  "dead",
  "theft",
  "siphon",
  "overheat",
  "offline",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** Duty cycle: hour (0-23) → base engine state */
export function dutyCycleState(hour: number): EngineState {
  if (hour >= 0 && hour < 6) return "OFF";
  if (hour >= 6 && hour < 8) return "IDLE";
  if (hour >= 8 && hour < 12) return "WORKING";
  if (hour >= 12 && hour < 13) return "IDLE";
  if (hour >= 13 && hour < 17) return "WORKING";
  if (hour >= 17 && hour < 22) return "IDLE";
  return "OFF";
}
