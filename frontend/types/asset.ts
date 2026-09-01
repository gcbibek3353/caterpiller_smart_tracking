export type EngineState = "OFF" | "IDLE" | "WORKING";

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

export interface TimelineEvent {
  id: string;
  ts: string;
  type: "check" | "usage" | "location" | "anomaly" | "alert";
  title: string;
  description?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
}

export interface EquipmentSummary {
  equipmentId: string;
  code: string;
  name: string;
  type: string;
  status: string;

  /** Identity + spec, so the detail header needs no second request. */
  imageUrl: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  /** number, not string — the backend converts the Prisma Decimal for us. */
  dailyRate: number;
  hourlyRate: number | null;
  fuelCapacityL: number;
  meterHours: number;
  homeLat: number;
  homeLng: number;
  notes: string | null;
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
    checkoutAt: string | null;
    checkinAt: string | null;
  };
}

export interface DailyUsageRow {
  date: string;
  workingHours: number;
  idleHours: number;
  engineHours: number;
  fuelUsedPct: number;
  avgTempC: number | null;
}

export interface AssetFixtureData {
  summary: EquipmentSummary;
  dailyUsage: DailyUsageRow[];
  fuelSeries: FuelAreaPoint[];
  tempSeries: TempLinePoint[];
  engineStateRibbon: EngineStateRibbonPoint[];
  track: MapPosition[];
  geofence: MapGeofence;
  timeline: TimelineEvent[];
}

export interface FleetDashboardData {
  fleetUtilizationPct: number;
  machinesOut: number;
  totalMachines: number;
  overdueCount: number;
  availableCount: number;
  maintenanceCount: number;
  revenue: number;
  statusDistribution: Array<{ status: string; count: number }>;
  attentionItems: Array<{
    id: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    title: string;
    description: string;
    equipmentId: string;
    equipmentCode: string;
  }>;
}

/* ── Live API response shapes (C6's analytics endpoints) ─────────────────
 * Hand-written to match `backend/src/routes/equipment-analytics.ts`. The
 * backend is the source of truth — if a field moves, it moves there first.
 */

/** `GET /api/equipment/:id/timeseries` — one server-bucketed point. */
export interface TimeseriesPoint {
  ts: string;
  value: number;
  engineState?: EngineState;
}

/** `GET /api/equipment/:id/daily` — one DailyUsage row. */
export interface DailyRow {
  date: string;
  engineHours: number;
  workingHours: number;
  idleHours: number;
  idleRatio: number;
  fuelUsedPct: number;
  avgTempC: number | null;
  distanceKm: number;
}

/** `GET /api/equipment/:id/track` — one GPS fix. */
export interface TrackPoint {
  lat: number;
  lng: number;
  ts: string;
}

/** `GET /api/equipment/:id/events` — a check-out or check-in scan. */
export interface CheckEventRow {
  id: string;
  type: "CHECK_OUT" | "CHECK_IN";
  at: string;
  bookingCode: string;
  scannedBy: string;
  meterHours: number | null;
  fuelPct: number | null;
  conditionNotes: string | null;
}

/** `GET /api/analytics/fleet` — the admin dashboard aggregate. */
export interface FleetAnalytics {
  fleetUtilizationPct: number;
  machinesOut: number;
  totalMachines: number;
  overdueCount: number;
  availableCount: number;
  maintenanceCount: number;
  revenue: number;
  statusDistribution: Array<{ status: string; count: number }>;
}
