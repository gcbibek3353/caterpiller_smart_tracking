/**
 * Every tunable threshold in the anomaly system lives here, not sprinkled
 * through the detectors — steps.md §9: "You will be retuning these live
 * the night before the demo."
 */
export const ANOMALY_CONFIG = {
  highIdle: {
    idleRatioMin: 0.5,
    idleHoursMin: 3,
    highIdleRatioMin: 0.7, // above this → HIGH instead of MEDIUM
  },
  zeroRuntime: {
    minConsecutiveDays: 2,
    highSeverityDays: 4,
  },
  missingOperator: {
    minEngineHours: 0,
  },
  unassignedSite: {
    lowToMediumHours: 48,
  },
  lowUtilization: {
    maxEngineHours: 2,
    minDaysOfLast: 3,
    windowDays: 5,
  },
  fuelEfficiencyDrift: {
    multiplierOfTrailingMedian: 1.4,
    trailingWindowDays: 28,
  },
  geofenceBreach: {
    minConsecutiveTicks: 3, // ">2 consecutive ticks" = at least 3
  },
  nightMovement: {
    minSpeedKph: 3,
    startHour: 22,
    endHour: 5,
  },
  implausibleSpeed: {
    maxSpeedKph: 25,
  },
  positionJump: {
    maxKmBetweenTicks: 5,
  },
  fuelDrop: {
    minPctDropInOneTick: 20,
  },
  overheat: {
    maxTempC: 105,
    minConsecutiveTicks: 3,
  },
  telemetryGap: {
    maxGapMinutes: 60,
  },
  overdue: {
    highSeverityAfterHours: 48,
  },
  upcomingReturn: {
    daysBefore: [3, 1] as number[],
  },
  statisticalOutlier: {
    zThreshold: 3.5,
    peerWindowDays: 30,
  },
  ewmaControlChart: {
    lambda: 0.2,
    sigmaThreshold: 3,
  },
} as const;
