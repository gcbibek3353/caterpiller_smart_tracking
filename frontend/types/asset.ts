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
    equipmentCode: string;
  }>;
}
