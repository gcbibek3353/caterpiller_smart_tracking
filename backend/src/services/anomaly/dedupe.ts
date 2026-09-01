function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** "YYYY-MM-DD" in local time — the day bucket for daily-rule dedupeKeys. */
export function dayBucket(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "YYYY-MM-DD-HH" in local time — the hour bucket for realtime-rule dedupeKeys (steps.md §9). */
export function hourBucket(d: Date): string {
  return `${dayBucket(d)}-${pad(d.getHours())}`;
}
