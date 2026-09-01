import type { EngineState, Scenario } from "../../src/shared";

export interface SiteConfig {
  lat: number;
  lng: number;
  radiusMeters: number;
}

export interface SimulatorConfig {
  equipmentId: string;
  equipmentCode: string;
  bookingId?: string;
  site: SiteConfig;
  seed?: number;
  scenario?: Scenario;
  /** Simulated minutes per step (default 10) */
  stepMinutes?: number;
}

export interface SimulatorState {
  ts: Date;
  lat: number;
  lng: number;
  engineState: EngineState;
  engineHours: number;
  fuelPct: number;
  engineTempC: number;
  ambientTempC: number;
  speedKph: number;
  /** Scenario runtime flags */
  scenarioActive?: boolean;
  offlineUntil?: Date;
  theftActive?: boolean;
  theftBearing?: number;
  theftDistanceM?: number;
}

export interface TelemetryOutput {
  equipmentId: string;
  bookingId?: string;
  ts: string;
  lat: number;
  lng: number;
  engineState: EngineState;
  engineHours: number;
  fuelPct: number;
  engineTempC: number;
  ambientTempC?: number;
  speedKph: number;
}
