import { median } from "../../lib/stats";
import { ANOMALY_CONFIG } from "./config";
import { dayBucket } from "./dedupe";
import type { AnomalyCandidate, DailyUsageLike } from "./types";

/**
 * Daily rules, run nightly after rollup over one equipment's `DailyUsage`
 * rows (steps.md §9). Each detector is pure: no DB access, unit-testable
 * against a handcrafted array. `rows` must be sorted ascending by date and
 * belong to a single piece of equipment.
 */

export function detectHighIdle(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const { idleRatioMin, idleHoursMin, highIdleRatioMin } = ANOMALY_CONFIG.highIdle;
  const out: AnomalyCandidate[] = [];
  for (const row of rows) {
    if (row.idleRatio > idleRatioMin && row.idleHours > idleHoursMin) {
      const severity = row.idleRatio > highIdleRatioMin ? "HIGH" : "MEDIUM";
      out.push({
        type: "HIGH_IDLE",
        severity,
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: row.date,
        windowEnd: row.date,
        metric: "idleRatio",
        value: row.idleRatio,
        threshold: idleRatioMin,
        message: `Idle ratio ${(row.idleRatio * 100).toFixed(0)}% (${row.idleHours.toFixed(1)}h idle) on ${dayBucket(row.date)}`,
        dedupeKey: `HIGH_IDLE:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

export function detectZeroRuntime(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const { minConsecutiveDays, highSeverityDays } = ANOMALY_CONFIG.zeroRuntime;
  const out: AnomalyCandidate[] = [];
  let streakLen = 0;
  let streakStart: Date | null = null;
  for (const row of rows) {
    const isZero = row.bookingStatus === "CHECKED_OUT" && row.engineHours === 0;
    if (isZero) {
      streakLen += 1;
      if (streakLen === 1) streakStart = row.date;
    } else {
      streakLen = 0;
      streakStart = null;
    }
    if (isZero && streakLen >= minConsecutiveDays) {
      const severity = streakLen >= highSeverityDays ? "HIGH" : "MEDIUM";
      out.push({
        type: "ZERO_RUNTIME",
        severity,
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: streakStart!,
        windowEnd: row.date,
        metric: "engineHours",
        value: 0,
        threshold: 0,
        message: `Zero engine hours for ${streakLen} consecutive day(s) ending ${dayBucket(row.date)}`,
        dedupeKey: `ZERO_RUNTIME:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

export function detectMissingOperator(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const out: AnomalyCandidate[] = [];
  for (const row of rows) {
    if (row.engineHours > 0 && !row.hasOperator) {
      out.push({
        type: "MISSING_OPERATOR",
        severity: "MEDIUM",
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: row.date,
        windowEnd: row.date,
        metric: "engineHours",
        value: row.engineHours,
        message: `Engine ran ${row.engineHours.toFixed(1)}h on ${dayBucket(row.date)} with no operator on record`,
        dedupeKey: `MISSING_OPERATOR:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

/**
 * `siteId == null` while `CHECKED_OUT`, for >24h → LOW, >48h → MEDIUM.
 * `DailyUsage` is daily-grain, so elapsed hours are approximated as
 * `consecutiveDays * 24` (fine at this resolution — day 2 of the streak
 * crosses 24h, day 3 crosses 48h).
 */
export function detectUnassignedSite(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const { lowToMediumHours } = ANOMALY_CONFIG.unassignedSite;
  const out: AnomalyCandidate[] = [];
  let streakLen = 0;
  let streakStart: Date | null = null;
  for (const row of rows) {
    const unassigned = row.bookingStatus === "CHECKED_OUT" && !row.siteId;
    if (unassigned) {
      streakLen += 1;
      if (streakLen === 1) streakStart = row.date;
    } else {
      streakLen = 0;
      streakStart = null;
    }
    const hoursElapsed = streakLen * 24;
    if (unassigned && hoursElapsed > 24) {
      const severity = hoursElapsed > lowToMediumHours ? "MEDIUM" : "LOW";
      out.push({
        type: "UNASSIGNED_SITE",
        severity,
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: streakStart!,
        windowEnd: row.date,
        metric: "hoursUnassigned",
        value: hoursElapsed,
        threshold: lowToMediumHours,
        message: `Checked out with no site for ~${hoursElapsed}h, as of ${dayBucket(row.date)}`,
        dedupeKey: `UNASSIGNED_SITE:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** `engineHours < 2` on a weekday for >=3 of the trailing 5 calendar days → LOW. */
export function detectLowUtilization(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const { maxEngineHours, minDaysOfLast, windowDays } = ANOMALY_CONFIG.lowUtilization;
  const out: AnomalyCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    const windowStartIdx = Math.max(0, i - windowDays + 1);
    const window = rows.slice(windowStartIdx, i + 1);
    const lowWeekdayCount = window.filter((r) => isWeekday(r.date) && r.engineHours < maxEngineHours).length;
    if (lowWeekdayCount >= minDaysOfLast) {
      const row = rows[i]!;
      out.push({
        type: "LOW_UTILIZATION",
        severity: "LOW",
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: window[0]!.date,
        windowEnd: row.date,
        metric: "engineHours",
        value: row.engineHours,
        threshold: maxEngineHours,
        message: `${lowWeekdayCount} of the last ${window.length} days under ${maxEngineHours}h on a weekday, as of ${dayBucket(row.date)}`,
        dedupeKey: `LOW_UTILIZATION:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

/** `fuelPerHour` > 1.4x the trailing 28-day median for that machine → MEDIUM. */
export function detectFuelEfficiencyDrift(rows: DailyUsageLike[]): AnomalyCandidate[] {
  const { multiplierOfTrailingMedian, trailingWindowDays } = ANOMALY_CONFIG.fuelEfficiencyDrift;
  const out: AnomalyCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.fuelPerHour == null) continue;
    const windowStartIdx = Math.max(0, i - trailingWindowDays);
    const trailing = rows
      .slice(windowStartIdx, i)
      .map((r) => r.fuelPerHour)
      .filter((v): v is number => v != null);
    if (trailing.length < 7) continue; // not enough history to judge drift yet
    const med = median(trailing);
    if (med <= 0) continue;
    const threshold = multiplierOfTrailingMedian * med;
    if (row.fuelPerHour > threshold) {
      out.push({
        type: "FUEL_EFFICIENCY_DRIFT",
        severity: "MEDIUM",
        equipmentId: row.equipmentId,
        bookingId: row.bookingId ?? null,
        windowStart: rows[windowStartIdx]!.date,
        windowEnd: row.date,
        metric: "fuelPerHour",
        value: row.fuelPerHour,
        threshold,
        message: `Fuel/hr ${row.fuelPerHour.toFixed(2)} is ${(row.fuelPerHour / med).toFixed(1)}x the trailing ${trailingWindowDays}-day median (${med.toFixed(2)}) on ${dayBucket(row.date)}`,
        dedupeKey: `FUEL_EFFICIENCY_DRIFT:${row.equipmentId}:${dayBucket(row.date)}`,
      });
    }
  }
  return out;
}

/** Runs every daily rule and concatenates the results. */
export function runDailyRules(rows: DailyUsageLike[]): AnomalyCandidate[] {
  return [
    ...detectHighIdle(rows),
    ...detectZeroRuntime(rows),
    ...detectMissingOperator(rows),
    ...detectUnassignedSite(rows),
    ...detectLowUtilization(rows),
    ...detectFuelEfficiencyDrift(rows),
  ];
}
