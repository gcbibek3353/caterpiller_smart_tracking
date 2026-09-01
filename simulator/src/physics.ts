import { dutyCycleState } from "@rental/shared";
import type { EngineState } from "@rental/shared";
import { createRng, type Rng } from "./rng";
import type {
  SimulatorConfig,
  SimulatorState,
  TelemetryOutput,
  SiteConfig,
} from "./types";

const TARGET_TEMP_C = 88;
const TEMP_TOLERANCE = 6;
const REFUEL_THRESHOLD = 12;
const STEP_MINUTES = 10;
const EARTH_RADIUS_M = 6_371_000;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

function movePoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angular = distanceM / EARTH_RADIUS_M;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angular) +
      Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
  );
  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(newLatRad),
    );

  return {
    lat: (newLatRad * 180) / Math.PI,
    lng: (newLngRad * 180) / Math.PI,
  };
}

function constrainToSite(
  lat: number,
  lng: number,
  site: SiteConfig,
  rng: Rng,
): { lat: number; lng: number } {
  const dist = haversineM(lat, lng, site.lat, site.lng);
  if (dist <= site.radiusMeters * 0.95) {
    return { lat, lng };
  }
  const bearing = rng.range(0, 360);
  const pullBack = dist - site.radiusMeters * 0.7;
  return movePoint(lat, lng, bearing + 180, pullBack);
}

function speedForState(state: EngineState, rng: Rng): number {
  switch (state) {
    case "OFF":
      return 0;
    case "IDLE":
      return clamp(rng.gaussian(0.5, 0.3), 0, 1);
    case "WORKING":
      return clamp(rng.gaussian(2.5, 0.8), 1, 4);
  }
}

function fuelBurn(state: EngineState, rng: Rng): number {
  switch (state) {
    case "OFF":
      return 0;
    case "IDLE":
      return Math.max(0, rng.gaussian(0.4, 0.1));
    case "WORKING":
      return Math.max(0, rng.gaussian(1.4, 0.3));
  }
}

function updateTemperature(
  current: number,
  state: EngineState,
  ambient: number,
  rng: Rng,
): number {
  const target =
    state === "OFF"
      ? ambient + rng.range(0, 3)
      : state === "IDLE"
        ? TARGET_TEMP_C - rng.range(2, 8)
        : TARGET_TEMP_C + rng.gaussian(0, TEMP_TOLERANCE / 2);

  const rate = state === "WORKING" ? 0.35 : state === "IDLE" ? 0.15 : 0.25;
  const next = current + (target - current) * rate;
  return clamp(next, ambient, 105);
}

function randomWalk(
  lat: number,
  lng: number,
  site: SiteConfig,
  speedKph: number,
  stepMinutes: number,
  rng: Rng,
): { lat: number; lng: number } {
  if (speedKph <= 0) return { lat, lng };

  const distanceM = (speedKph * 1000 * stepMinutes) / 60;
  const bearing = rng.range(0, 360);
  const moved = movePoint(lat, lng, bearing, distanceM);
  return constrainToSite(moved.lat, moved.lng, site, rng);
}

export function createInitialState(
  config: SimulatorConfig,
  startTime: Date,
): SimulatorState {
  const rng = createRng(config.seed ?? hashString(config.equipmentId));
  const hour = startTime.getUTCHours();
  const engineState = dutyCycleState(hour);

  return {
    ts: startTime,
    lat: config.site.lat + rng.gaussian(0, 0.0001),
    lng: config.site.lng + rng.gaussian(0, 0.0001),
    engineState,
    engineHours: 100 + rng.range(0, 500),
    fuelPct: rng.range(40, 90),
    engineTempC: engineState === "OFF" ? 25 : 70 + rng.range(0, 10),
    ambientTempC: 25 + rng.gaussian(0, 2),
    speedKph: speedForState(engineState, rng),
    scenarioActive: !!config.scenario,
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export interface SimulateOptions {
  scenario?: import("@rental/shared").Scenario;
  scenarioState?: ScenarioRuntime;
}

export interface ScenarioRuntime {
  type?: import("@rental/shared").Scenario;
  theftTriggered?: boolean;
  theftBearing?: number;
  offlineUntil?: Date;
  overheatRamp?: number;
  siphonNext?: boolean;
}

/**
 * Pure physics step: previousState + currentTime → nextState + telemetry tick.
 * No DB, HTTP, or side effects.
 */
export function simulate(
  prev: SimulatorState,
  config: SimulatorConfig,
  scenarioRuntime: ScenarioRuntime = {},
): { state: SimulatorState; tick: TelemetryOutput | null } {
  const stepMinutes = config.stepMinutes ?? STEP_MINUTES;
  const rng = createRng(
    (config.seed ?? hashString(config.equipmentId)) +
      prev.ts.getTime(),
  );

  const nextTs = new Date(prev.ts.getTime() + stepMinutes * 60_000);
  const hour = nextTs.getUTCHours();
  let engineState: EngineState = dutyCycleState(hour);

  // Scenario: offline — suppress tick entirely
  if (scenarioRuntime.offlineUntil && nextTs < scenarioRuntime.offlineUntil) {
    return {
      state: { ...prev, ts: nextTs },
      tick: null,
    };
  }

  const scenario = config.scenario ?? scenarioRuntime.type;

  // Apply scenario overrides
  if (scenario === "idle") {
    if (hour >= 8 && hour < 17) engineState = "IDLE";
  } else if (scenario === "dead") {
    engineState = "OFF";
  } else if (scenario === "overheat") {
    scenarioRuntime.overheatRamp = (scenarioRuntime.overheatRamp ?? 0) + 1;
  }

  let lat = prev.lat;
  let lng = prev.lng;
  let speedKph = speedForState(engineState, rng);
  let fuelPct = prev.fuelPct;
  let engineTempC = prev.engineTempC;
  let engineHours = prev.engineHours;

  // Engine hours: +10/60 when not OFF
  if (engineState !== "OFF") {
    engineHours += stepMinutes / 60;
  }

  // Fuel simulation
  if (scenario === "siphon" && engineState === "OFF") {
    fuelPct = Math.max(0, fuelPct - rng.range(30, 40));
  } else {
    fuelPct = Math.max(0, fuelPct - fuelBurn(engineState, rng));
  }

  if (fuelPct < REFUEL_THRESHOLD) {
    fuelPct = 95 + rng.range(0, 5);
  }

  // Temperature
  if (scenario === "overheat") {
    const ramp = scenarioRuntime.overheatRamp ?? 1;
    engineTempC = clamp(88 + ramp * 3, prev.ambientTempC, 115);
  } else {
    engineTempC = updateTemperature(
      prev.engineTempC,
      engineState,
      prev.ambientTempC,
      rng,
    );
  }

  // GPS movement
  if (scenario === "theft") {
    const distFromSite = haversineM(lat, lng, config.site.lat, config.site.lng);
    if (!scenarioRuntime.theftTriggered && hour === 2 && distFromSite < config.site.radiusMeters) {
      scenarioRuntime.theftTriggered = true;
      scenarioRuntime.theftBearing = rng.range(0, 360);
    }
    if (scenarioRuntime.theftTriggered) {
      const theftSpeed = 70;
      const distanceM = (theftSpeed * 1000 * stepMinutes) / 60;
      const moved = movePoint(
        lat,
        lng,
        scenarioRuntime.theftBearing ?? 45,
        distanceM,
      );
      lat = moved.lat;
      lng = moved.lng;
      speedKph = theftSpeed;
      engineState = "WORKING";
    } else {
      const moved = randomWalk(lat, lng, config.site, speedKph, stepMinutes, rng);
      lat = moved.lat;
      lng = moved.lng;
    }
  } else if (engineState !== "OFF") {
    const moved = randomWalk(lat, lng, config.site, speedKph, stepMinutes, rng);
    lat = moved.lat;
    lng = moved.lng;
  } else {
    speedKph = 0;
  }

  const tick: TelemetryOutput = {
    equipmentId: config.equipmentId,
    bookingId: config.bookingId,
    ts: nextTs.toISOString(),
    lat,
    lng,
    engineState,
    engineHours: Math.round(engineHours * 1000) / 1000,
    fuelPct: Math.round(fuelPct * 10) / 10,
    engineTempC: Math.round(engineTempC * 10) / 10,
    ambientTempC: Math.round(prev.ambientTempC * 10) / 10,
    speedKph: Math.round(speedKph * 10) / 10,
  };

  const nextState: SimulatorState = {
    ts: nextTs,
    lat,
    lng,
    engineState,
    engineHours: tick.engineHours,
    fuelPct: tick.fuelPct,
    engineTempC: tick.engineTempC,
    ambientTempC: prev.ambientTempC,
    speedKph: tick.speedKph,
    theftActive: scenarioRuntime.theftTriggered,
    theftBearing: scenarioRuntime.theftBearing,
    offlineUntil: scenarioRuntime.offlineUntil,
  };

  return { state: nextState, tick };
}

/** Run a full simulated day and return all ticks */
export function simulateDay(
  config: SimulatorConfig,
  dayStart: Date,
): TelemetryOutput[] {
  const ticks: TelemetryOutput[] = [];
  let state = createInitialState(config, dayStart);
  const scenarioRuntime: ScenarioRuntime = { type: config.scenario };

  if (config.scenario === "offline") {
    scenarioRuntime.offlineUntil = new Date(
      dayStart.getTime() + 3 * 60 * 60_000,
    );
  }

  const endOfDay = new Date(dayStart.getTime() + 24 * 60 * 60_000);

  while (state.ts < endOfDay) {
    const result = simulate(state, config, scenarioRuntime) as {
      state: SimulatorState;
      tick: TelemetryOutput | null;
    };
    state = result.state;
    if (result.tick) ticks.push(result.tick);
  }

  return ticks;
}

export { haversineM, constrainToSite };
