/**
 * De-duplication / rate-limiting logic (steps.md §9): only MEDIUM anomalies
 * go into the hourly digest; HIGH always breaks out into its own immediate
 * mail. One digest per recipient per hour, maximum.
 */

export interface SeverityItem {
  severity: "LOW" | "MEDIUM" | "HIGH";
}

/** Splits candidates into what should go out immediately vs. what should wait for the next digest. */
export function partitionBySeverity<T extends SeverityItem>(items: T[]): { immediate: T[]; digestible: T[] } {
  return {
    immediate: items.filter((i) => i.severity === "HIGH"),
    digestible: items.filter((i) => i.severity === "MEDIUM"),
  };
}

/** True once at least `minIntervalMinutes` have passed since the last digest send (or none has ever been sent). */
export function shouldSendDigestNow(lastDigestSentAt: Date | null, now: Date, minIntervalMinutes = 60): boolean {
  if (!lastDigestSentAt) return true;
  return (now.getTime() - lastDigestSentAt.getTime()) / 60_000 >= minIntervalMinutes;
}
