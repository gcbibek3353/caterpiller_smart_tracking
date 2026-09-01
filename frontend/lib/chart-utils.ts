import type { UsageLinePoint } from "@/types/asset";
import { CHART, ENGINE_STATE_COLOR } from "./design-system";

/**
 * Chart helpers that aren't design tokens. Colours, geometry and formatters
 * live in `lib/design-system.ts` — these re-exports keep the older import
 * sites working without giving the palette a second home.
 */
export { formatShortDate, formatTime, formatDateTime } from "./design-system";

export const CHART_HEIGHT = CHART.height;
export const ENGINE_STATE_COLORS = ENGINE_STATE_COLOR;

/** Trailing moving average. Short windows at the head average what's there. */
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
