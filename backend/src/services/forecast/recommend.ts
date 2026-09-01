import type { EquipmentType, Recommendation } from "./types";

export interface RecommendationInput {
  equipmentType: EquipmentType;
  /** null = company-wide. */
  siteId: string | null;
  /** Human label for the sentence — "Site A", or omitted for company-wide. Purely cosmetic. */
  siteLabel?: string;
  weekStart: string;
  /** Predicted weekly rental-days for this series/week. */
  predictedWeeklyRentalDays: number;
  /** Upper bound of the weekly rental-days interval — used for stocking decisions. */
  upperWeeklyRentalDays: number;
  fleetSize: number;
}

/**
 * Turns a forecast number into a plain-English recommendation (steps.md §8
 * Step 5) — "the sentences are what people remember." Site-aware: the same
 * sentence shape works for "SITE A: Excavator..." and "Company-wide:
 * Excavator..." — only the label and which fleet/demand numbers feed it differ.
 */
export function buildRecommendation(input: RecommendationInput): Recommendation {
  const { equipmentType, siteId, siteLabel, weekStart, predictedWeeklyRentalDays, upperWeeklyRentalDays, fleetSize } = input;
  const capacity = fleetSize * 7;
  const utilization = capacity === 0 ? 0 : predictedWeeklyRentalDays / capacity;
  // Use the UPPER bound for stocking, per spec.
  const gapUnits = Math.ceil(upperWeeklyRentalDays / 7) - fleetSize;
  const pct = Math.round(utilization * 100);
  // Average concurrent units in use that week — directly comparable to fleetSize,
  // which "56 rental-days" isn't. utilization * fleetSize = predictedWeeklyRentalDays / 7, just phrased for people.
  const predictedUnits = Math.round(utilization * fleetSize * 10) / 10;
  const label = siteLabel ?? (siteId ? "This site" : "Company-wide");

  let sentence: string;
  if (utilization > 0.85) {
    const short = Math.max(1, gapUnits);
    sentence = `${label}: ${equipmentType} demand is projected to reach ${predictedUnits} units next week (${pct}% utilization). Current fleet is ${fleetSize}, so approximately ${short} additional unit${short === 1 ? "" : "s"} may be required.`;
  } else if (utilization < 0.35) {
    const idle = Math.max(1, -gapUnits);
    sentence = `${label}: ${equipmentType} demand is projected at only ${predictedUnits} units next week (${pct}% utilization). ${idle} unit${idle === 1 ? "" : "s"} likely idle — consider a promotional rate or reallocating.`;
  } else {
    sentence = `${label}: ${equipmentType} demand is projected at ${predictedUnits} units next week (${pct}% utilization), in line with current fleet capacity.`;
  }

  return { equipmentType, siteId, weekStart, utilization, gapUnits, sentence };
}

/** True when a series has under 60 days of history — too little for its own Holt-Winters fit (steps.md §8 Cold start). */
export function isColdStart(daysOfHistory: number): boolean {
  return daysOfHistory < 60;
}
