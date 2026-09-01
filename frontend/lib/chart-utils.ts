import type { UsageLinePoint } from "@/types/asset";

export const CHART_HEIGHT = 280;

export const ENGINE_STATE_COLORS = {
  OFF: "#94a3b8",
  IDLE: "#f59e0b",
  WORKING: "#22c55e",
} as const;

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function computeMovingAverage(
  data: Array<{ date: string; engineHours: number }>,
  window = 7,
): UsageLinePoint[] {
  return data.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((s, p) => s + p.engineHours, 0) / slice.length;
    return { ...point, movingAvg7d: Math.round(avg * 10) / 10 };
  });
}
