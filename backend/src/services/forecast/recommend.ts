import type { EquipmentType, Recommendation } from "./types";

export interface RecommendationInput {
  equipmentType: EquipmentType;
  weekStart: string;
  /** Predicted weekly rental-days for this type/week. */
  predictedWeeklyRentalDays: number;
  /** Upper bound of the weekly rental-days interval — used for stocking decisions. */
  upperWeeklyRentalDays: number;
  fleetSize: number;
}

/**
 * Turns a forecast number into a plain-English recommendation (steps.md §8
 * Step 5) — "the sentences are what people remember."
 */
export function buildRecommendation(input: RecommendationInput): Recommendation {
  const { equipmentType, weekStart, predictedWeeklyRentalDays, upperWeeklyRentalDays, fleetSize } = input;
  const capacity = fleetSize * 7;
  const utilization = capacity === 0 ? 0 : predictedWeeklyRentalDays / capacity;
  // Use the UPPER bound for stocking, per spec.
  const gapUnits = Math.ceil(upperWeeklyRentalDays / 7) - fleetSize;
  const pct = Math.round(utilization * 100);

  let sentence: string;
  if (utilization > 0.85) {
    const short = Math.max(1, gapUnits);
    sentence = `${equipmentType}: ${pct}% projected utilization, week of ${weekStart}. Short ~${short} unit${short === 1 ? "" : "s"}. Consider transferring from another depot or acquiring.`;
  } else if (utilization < 0.35) {
    const idle = Math.max(1, -gapUnits);
    sentence = `${equipmentType}: ${pct}% projected utilization for week of ${weekStart}. ${idle} unit${idle === 1 ? "" : "s"} likely idle — consider a promotional rate.`;
  } else {
    sentence = `${equipmentType}: ${pct}% projected utilization, week of ${weekStart}.`;
  }

  return { equipmentType, weekStart, utilization, gapUnits, sentence };
}

/** True when a type has under 60 days of history — too little for its own Holt-Winters fit (steps.md §8 Cold start). */
export function isColdStart(daysOfHistory: number): boolean {
  return daysOfHistory < 60;
}
