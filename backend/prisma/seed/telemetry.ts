import type { EngineState } from "@prisma/client";
import { Rng } from "../../src/lib/random";
import { addMinutes, startOfUtcDay, ymd } from "../../src/lib/dates";
import { haversineKm, metersToDegLat, metersToDegLng } from "../../src/lib/geo";
import * as C from "./config";

export type Tick = {
  equipmentId: string;
  bookingId: string;
  ts: Date;
  lat: number;
  lng: number;
  engineState: EngineState;
  engineHours: number;
  fuelPct: number;
  engineTempC: number;
  ambientTempC: number;
  speedKph: number;
  operatorId: string | null;
};

export type FaultKind = (typeof C.INJECTED_FAULTS)[number]["kind"];

export type MachineState = {
  engineHours: number;
  fuelPct: number;
  tempC: number;
  lat: number;
  lng: number;
};

const HOURS_PER_TICK = C.TICK_MINUTES / 60;

/** Duty cycle from steps.md §6 — the hour-of-day model that shapes every chart. */
function pickState(ts: Date, rng: Rng): EngineState {
  const hour = ts.getUTCHours();
  const dow = ts.getUTCDay();

  if (dow === 0) return rng.bool(C.SUNDAY_OFF_PROBABILITY) ? "OFF" : "IDLE";

  const working = hour >= C.DUTY_WORK_HOURS.start && hour < C.DUTY_WORK_HOURS.end;
  if (!working) return rng.bool(C.DUTY_OFF_HOURS.idle) ? "IDLE" : "OFF";

  const r = rng.next();
  if (r < C.DUTY_WORK_HOURS.working) return "WORKING";
  if (r < C.DUTY_WORK_HOURS.working + C.DUTY_WORK_HOURS.idle) return "IDLE";
  return "OFF";
}

/**
 * Generates 10-minute ticks for one booking over [from, to].
 *
 * `state` is carried IN and OUT so engine hours, fuel and temperature stay
 * continuous across day boundaries — a fuel gauge that resets at midnight is
 * the first thing anyone notices on the asset page.
 */
export function generateTicks(opts: {
  equipmentId: string;
  bookingId: string;
  operatorId: string | null;
  site: { lat: number; lng: number; radiusMeters: number };
  from: Date;
  to: Date;
  state: MachineState;
  rng: Rng;
  fault?: { kind: FaultKind; from: Date };
}): Tick[] {
  const { equipmentId, bookingId, operatorId, site, from, to, state, rng, fault } = opts;
  const ticks: Tick[] = [];

  for (let ts = new Date(from); ts <= to; ts = addMinutes(ts, C.TICK_MINUTES)) {
    const faultActive = fault ? ts >= fault.from : false;

    let engineState = pickState(ts, rng);
    const hour = ts.getUTCHours();
    const inWorkHours = hour >= C.DUTY_WORK_HOURS.start && hour < C.DUTY_WORK_HOURS.end;

    // ── injected faults: real signals for D's detectors, not fixture rows ──
    if (faultActive) {
      if (fault!.kind === "high_idle" && inWorkHours) engineState = "IDLE";
      if (fault!.kind === "zero_runtime") engineState = "OFF";
    }

    // engine hours accrue whenever the engine is turning
    if (engineState !== "OFF") state.engineHours += HOURS_PER_TICK;

    // ── fuel ──
    if (engineState === "WORKING") {
      state.fuelPct -= rng.clampedGauss(C.FUEL_BURN.working[0], C.FUEL_BURN.working[1], 0.4, 3);
    } else if (engineState === "IDLE") {
      state.fuelPct -= rng.clampedGauss(C.FUEL_BURN.idle[0], C.FUEL_BURN.idle[1], 0.05, 1.2);
    }
    if (faultActive && fault!.kind === "fuel_drop" && engineState === "OFF" && rng.bool(0.02)) {
      state.fuelPct -= 35; // siphon: a big drop with the engine off
    }
    if (state.fuelPct < C.REFUEL_BELOW_PCT) {
      state.fuelPct = rng.float(88, 100); // refuel — this is the saw-tooth on the chart
    }
    state.fuelPct = Math.min(100, Math.max(0, state.fuelPct));

    // ── temperature: rises under load, decays toward ambient when off ──
    const ambient = C.TEMP.ambient + 6 * Math.sin((2 * Math.PI * (hour - 9)) / 24);
    if (faultActive && fault!.kind === "overheat" && engineState !== "OFF") {
      state.tempC = Math.min(115, state.tempC + rng.float(1.5, 4));
    } else if (engineState === "WORKING") {
      const target = rng.clampedGauss(C.TEMP.workingTarget, C.TEMP.workingSd, 70, C.TEMP.cap);
      state.tempC += (target - state.tempC) * 0.35;
    } else if (engineState === "IDLE") {
      state.tempC += (70 - state.tempC) * 0.2;
    } else {
      state.tempC += (ambient - state.tempC) * 0.15;
    }

    // ── position: random walk inside the geofence when running, parked when off ──
    let speedKph = 0;
    if (engineState !== "OFF") {
      speedKph = engineState === "WORKING" ? rng.float(0, 4) : rng.float(0, 0.5);
      const stepM = speedKph * (C.TICK_MINUTES / 60) * 1000 * 0.4;
      const bearing = rng.float(0, 2 * Math.PI);
      state.lat += metersToDegLat(stepM * Math.cos(bearing));
      state.lng += metersToDegLng(stepM * Math.sin(bearing), state.lat);

      // keep it inside the site fence — pull back toward the centre if it drifts
      const outM = haversineKm(state.lat, state.lng, site.lat, site.lng) * 1000;
      if (outM > site.radiusMeters * 0.85) {
        state.lat += (site.lat - state.lat) * 0.5;
        state.lng += (site.lng - state.lng) * 0.5;
      }
    }

    ticks.push({
      equipmentId,
      bookingId,
      ts: new Date(ts),
      lat: Number(state.lat.toFixed(6)),
      lng: Number(state.lng.toFixed(6)),
      engineState,
      engineHours: Number(state.engineHours.toFixed(2)),
      fuelPct: Number(state.fuelPct.toFixed(1)),
      engineTempC: Number(state.tempC.toFixed(1)),
      ambientTempC: Number(ambient.toFixed(1)),
      speedKph: Number(speedKph.toFixed(1)),
      operatorId,
    });
  }

  return ticks;
}

export type DailyRow = {
  equipmentId: string;
  bookingId: string | null;
  date: Date;
  engineHours: number;
  workingHours: number;
  idleHours: number;
  idleRatio: number;
  isOperatingDay: boolean;
  fuelUsedPct: number;
  fuelPerHour: number | null;
  distanceKm: number;
  maxTempC: number | null;
  avgTempC: number | null;
  nightMoveMin: number;
  offSiteMin: number;
  sampleCount: number;
  hasOperator: boolean;
};

/**
 * Collapses ticks into one DailyUsage row per equipment per day.
 *
 * This mirrors what C's `services/rollup.ts` must produce. Seeded days and live
 * days therefore have the same shape, which is the whole point of A9 — if C's
 * rollup disagrees with this, one of the two is wrong and you want to know
 * before the demo, not during it.
 */
export function rollupTicks(
  ticks: Tick[],
  site: { lat: number; lng: number; radiusMeters: number },
): DailyRow[] {
  const byDay = new Map<string, Tick[]>();
  for (const t of ticks) {
    const key = ymd(t.ts);
    const arr = byDay.get(key);
    if (arr) arr.push(t);
    else byDay.set(key, [t]);
  }

  const rows: DailyRow[] = [];

  for (const [, dayTicks] of byDay) {
    dayTicks.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    const first = dayTicks[0]!;

    let working = 0;
    let idle = 0;
    let fuelUsed = 0;
    let distanceKm = 0;
    let nightMoveMin = 0;
    let offSiteMin = 0;
    let maxTemp = -Infinity;
    let tempSum = 0;

    for (let i = 0; i < dayTicks.length; i++) {
      const t = dayTicks[i]!;
      if (t.engineState === "WORKING") working += HOURS_PER_TICK;
      else if (t.engineState === "IDLE") idle += HOURS_PER_TICK;

      const prev = dayTicks[i - 1];
      if (prev) {
        // refuels are increases — only count consumption
        const drop = prev.fuelPct - t.fuelPct;
        if (drop > 0) fuelUsed += drop;
        distanceKm += haversineKm(prev.lat, prev.lng, t.lat, t.lng);
      }

      const hour = t.ts.getUTCHours();
      if (t.speedKph > 3 && (hour >= 22 || hour < 5)) nightMoveMin += C.TICK_MINUTES;
      if (haversineKm(t.lat, t.lng, site.lat, site.lng) * 1000 > site.radiusMeters) {
        offSiteMin += C.TICK_MINUTES;
      }

      maxTemp = Math.max(maxTemp, t.engineTempC);
      tempSum += t.engineTempC;
    }

    const engineHours = working + idle;
    rows.push({
      equipmentId: first.equipmentId,
      bookingId: first.bookingId,
      date: startOfUtcDay(first.ts),
      engineHours: Number(engineHours.toFixed(2)),
      workingHours: Number(working.toFixed(2)),
      idleHours: Number(idle.toFixed(2)),
      idleRatio: engineHours > 0 ? Number((idle / engineHours).toFixed(3)) : 0,
      isOperatingDay: engineHours >= 0.5,
      fuelUsedPct: Number(fuelUsed.toFixed(1)),
      fuelPerHour: engineHours > 0 ? Number((fuelUsed / engineHours).toFixed(3)) : null,
      distanceKm: Number(distanceKm.toFixed(3)),
      maxTempC: maxTemp === -Infinity ? null : Number(maxTemp.toFixed(1)),
      avgTempC: dayTicks.length ? Number((tempSum / dayTicks.length).toFixed(1)) : null,
      nightMoveMin,
      offSiteMin,
      sampleCount: dayTicks.length,
      hasOperator: first.operatorId !== null,
    });
  }

  return rows;
}
