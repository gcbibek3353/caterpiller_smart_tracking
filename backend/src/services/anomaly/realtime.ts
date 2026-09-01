import { haversine } from "../../lib/stats";
import { ANOMALY_CONFIG } from "./config";
import { hourBucket } from "./dedupe";
import type { AnomalyCandidate, SiteLike, TelemetryLike } from "./types";

/**
 * Realtime rules, run every 10 min over the last ~2h of `Telemetry`
 * (steps.md §9). `ticks` must be sorted ascending by `ts` and belong to a
 * single piece of equipment. Pure: no DB access.
 */

function isNightHour(d: Date, startHour: number, endHour: number): boolean {
  const h = d.getHours();
  return startHour > endHour ? h >= startHour || h < endHour : h >= startHour && h < endHour;
}

export function detectGeofenceBreach(ticks: TelemetryLike[], site: SiteLike): AnomalyCandidate[] {
  const { minConsecutiveTicks } = ANOMALY_CONFIG.geofenceBreach;
  const out: AnomalyCandidate[] = [];
  let streak = 0;
  for (const tick of ticks) {
    const distanceM = haversine({ lat: tick.lat, lng: tick.lng }, { lat: site.lat, lng: site.lng }) * 1000;
    const outside = distanceM > site.radiusMeters;
    streak = outside ? streak + 1 : 0;
    if (outside && streak >= minConsecutiveTicks) {
      out.push({
        type: "GEOFENCE_BREACH",
        severity: "HIGH",
        equipmentId: tick.equipmentId,
        bookingId: tick.bookingId ?? null,
        windowStart: tick.ts,
        windowEnd: tick.ts,
        metric: "distanceMeters",
        value: distanceM,
        threshold: site.radiusMeters,
        message: `${distanceM.toFixed(0)}m outside the ${site.radiusMeters}m geofence at ${tick.ts.toISOString()}`,
        dedupeKey: `GEOFENCE_BREACH:${tick.equipmentId}:${hourBucket(tick.ts)}`,
      });
    }
  }
  return out;
}

export function detectNightMovement(ticks: TelemetryLike[]): AnomalyCandidate[] {
  const { minSpeedKph, startHour, endHour } = ANOMALY_CONFIG.nightMovement;
  const out: AnomalyCandidate[] = [];
  for (const tick of ticks) {
    if (tick.speedKph > minSpeedKph && isNightHour(tick.ts, startHour, endHour)) {
      out.push({
        type: "NIGHT_MOVEMENT",
        severity: "HIGH",
        equipmentId: tick.equipmentId,
        bookingId: tick.bookingId ?? null,
        windowStart: tick.ts,
        windowEnd: tick.ts,
        metric: "speedKph",
        value: tick.speedKph,
        threshold: minSpeedKph,
        message: `Moving at ${tick.speedKph.toFixed(1)}kph at ${tick.ts.toISOString()}, outside working hours`,
        dedupeKey: `NIGHT_MOVEMENT:${tick.equipmentId}:${hourBucket(tick.ts)}`,
      });
    }
  }
  return out;
}

export function detectImplausibleSpeed(ticks: TelemetryLike[]): AnomalyCandidate[] {
  const { maxSpeedKph } = ANOMALY_CONFIG.implausibleSpeed;
  const out: AnomalyCandidate[] = [];
  for (const tick of ticks) {
    if (tick.speedKph > maxSpeedKph) {
      out.push({
        type: "IMPLAUSIBLE_SPEED",
        severity: "HIGH",
        equipmentId: tick.equipmentId,
        bookingId: tick.bookingId ?? null,
        windowStart: tick.ts,
        windowEnd: tick.ts,
        metric: "speedKph",
        value: tick.speedKph,
        threshold: maxSpeedKph,
        message: `Speed ${tick.speedKph.toFixed(1)}kph exceeds plausible self-propulsion at ${tick.ts.toISOString()}`,
        dedupeKey: `IMPLAUSIBLE_SPEED:${tick.equipmentId}:${hourBucket(tick.ts)}`,
      });
    }
  }
  return out;
}

export function detectPositionJump(ticks: TelemetryLike[]): AnomalyCandidate[] {
  const { maxKmBetweenTicks } = ANOMALY_CONFIG.positionJump;
  const out: AnomalyCandidate[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!;
    const cur = ticks[i]!;
    const distanceKm = haversine({ lat: prev.lat, lng: prev.lng }, { lat: cur.lat, lng: cur.lng });
    if (distanceKm > maxKmBetweenTicks) {
      out.push({
        type: "POSITION_JUMP",
        severity: "HIGH",
        equipmentId: cur.equipmentId,
        bookingId: cur.bookingId ?? null,
        windowStart: prev.ts,
        windowEnd: cur.ts,
        metric: "distanceKm",
        value: distanceKm,
        threshold: maxKmBetweenTicks,
        message: `Jumped ${distanceKm.toFixed(1)}km between consecutive ticks ending ${cur.ts.toISOString()}`,
        dedupeKey: `POSITION_JUMP:${cur.equipmentId}:${hourBucket(cur.ts)}`,
      });
    }
  }
  return out;
}

export function detectFuelDrop(ticks: TelemetryLike[]): AnomalyCandidate[] {
  const { minPctDropInOneTick } = ANOMALY_CONFIG.fuelDrop;
  const out: AnomalyCandidate[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!;
    const cur = ticks[i]!;
    const drop = prev.fuelPct - cur.fuelPct;
    if (cur.engineState === "OFF" && drop > minPctDropInOneTick) {
      out.push({
        type: "FUEL_DROP",
        severity: "HIGH",
        equipmentId: cur.equipmentId,
        bookingId: cur.bookingId ?? null,
        windowStart: prev.ts,
        windowEnd: cur.ts,
        metric: "fuelPct",
        value: drop,
        threshold: minPctDropInOneTick,
        message: `Fuel dropped ${drop.toFixed(0)} points with engine OFF, ending ${cur.ts.toISOString()}`,
        dedupeKey: `FUEL_DROP:${cur.equipmentId}:${hourBucket(cur.ts)}`,
      });
    }
  }
  return out;
}

export function detectOverheat(ticks: TelemetryLike[]): AnomalyCandidate[] {
  const { maxTempC, minConsecutiveTicks } = ANOMALY_CONFIG.overheat;
  const out: AnomalyCandidate[] = [];
  let streak = 0;
  let streakStart: Date | null = null;
  for (const tick of ticks) {
    const hot = tick.engineTempC > maxTempC;
    if (hot) {
      streak += 1;
      if (streak === 1) streakStart = tick.ts;
    } else {
      streak = 0;
      streakStart = null;
    }
    if (hot && streak >= minConsecutiveTicks) {
      out.push({
        type: "OVERHEAT",
        severity: "HIGH",
        equipmentId: tick.equipmentId,
        bookingId: tick.bookingId ?? null,
        windowStart: streakStart!,
        windowEnd: tick.ts,
        metric: "engineTempC",
        value: tick.engineTempC,
        threshold: maxTempC,
        message: `Engine temp ${tick.engineTempC.toFixed(1)}°C for ${streak} consecutive ticks ending ${tick.ts.toISOString()}`,
        dedupeKey: `OVERHEAT:${tick.equipmentId}:${hourBucket(tick.ts)}`,
      });
    }
  }
  return out;
}

/**
 * No tick for >60min. Assumes the caller only passes ticks for a booking
 * that is (or was, up to `now`) `CHECKED_OUT` — filtering by booking status
 * is the runner's job, not this pure function's.
 */
export function detectTelemetryGap(ticks: TelemetryLike[], now?: Date): AnomalyCandidate[] {
  const { maxGapMinutes } = ANOMALY_CONFIG.telemetryGap;
  const out: AnomalyCandidate[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const prev = ticks[i - 1]!;
    const cur = ticks[i]!;
    const gapMin = (cur.ts.getTime() - prev.ts.getTime()) / 60_000;
    if (gapMin > maxGapMinutes) {
      out.push({
        type: "TELEMETRY_GAP",
        severity: "MEDIUM",
        equipmentId: cur.equipmentId,
        bookingId: cur.bookingId ?? null,
        windowStart: prev.ts,
        windowEnd: cur.ts,
        metric: "gapMinutes",
        value: gapMin,
        threshold: maxGapMinutes,
        message: `No telemetry for ${gapMin.toFixed(0)} minutes, ending ${cur.ts.toISOString()}`,
        dedupeKey: `TELEMETRY_GAP:${cur.equipmentId}:${hourBucket(cur.ts)}`,
      });
    }
  }
  if (now && ticks.length > 0) {
    const last = ticks[ticks.length - 1]!;
    const gapMin = (now.getTime() - last.ts.getTime()) / 60_000;
    if (gapMin > maxGapMinutes) {
      out.push({
        type: "TELEMETRY_GAP",
        severity: "MEDIUM",
        equipmentId: last.equipmentId,
        bookingId: last.bookingId ?? null,
        windowStart: last.ts,
        windowEnd: now,
        metric: "gapMinutes",
        value: gapMin,
        threshold: maxGapMinutes,
        message: `No telemetry for ${gapMin.toFixed(0)} minutes as of ${now.toISOString()}`,
        dedupeKey: `TELEMETRY_GAP:${last.equipmentId}:${hourBucket(now)}`,
      });
    }
  }
  return out;
}

/** Runs every realtime rule that doesn't need a site and concatenates the results. */
export function runRealtimeRules(ticks: TelemetryLike[], now?: Date): AnomalyCandidate[] {
  return [
    ...detectNightMovement(ticks),
    ...detectImplausibleSpeed(ticks),
    ...detectPositionJump(ticks),
    ...detectFuelDrop(ticks),
    ...detectOverheat(ticks),
    ...detectTelemetryGap(ticks, now),
  ];
}
