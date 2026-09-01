/**
 * UTC-only date helpers. The A1 decision is: store UTC, convert at the edges.
 * Every function here operates on UTC components — never the local-time
 * getters, which silently shift days for anyone not on UTC.
 */

export const DAY_MS = 86_400_000;

/** Midnight UTC on the day containing `d`. */
export const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

export const addMinutes = (d: Date, n: number): Date => new Date(d.getTime() + n * 60_000);

/** Whole days from a to b (b - a). */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime()) / DAY_MS);

/** 0 = Sunday … 6 = Saturday, in UTC. */
export const utcDow = (d: Date): number => d.getUTCDay();

export const isWeekend = (d: Date): boolean => utcDow(d) === 0 || utcDow(d) === 6;

/** Monday of the ISO week containing `d`. Forecast periods start on Monday. */
export const mondayOf = (d: Date): Date => {
  const day = startOfUtcDay(d);
  const dow = day.getUTCDay(); // 0=Sun
  return addDays(day, dow === 0 ? -6 : 1 - dow);
};

/** 1-based day of year, UTC. */
export const dayOfYear = (d: Date): number =>
  Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / DAY_MS);

/** Inclusive list of midnight-UTC days from `from` to `to`. */
export const eachUtcDay = (from: Date, to: Date): Date[] => {
  const out: Date[] = [];
  for (let d = startOfUtcDay(from); d <= startOfUtcDay(to); d = addDays(d, 1)) out.push(d);
  return out;
};

/** Do [aStart,aEnd] and [bStart,bEnd] overlap? Inclusive, matching the booking rule. */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart <= bEnd && bStart <= aEnd;

/** YYYY-MM-DD in UTC — for dedupe keys and @db.Date columns. */
export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
