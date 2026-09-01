/**
 * Recharts takes real colour values as props, not Tailwind classes — this is
 * the "data plate" palette from app/globals.css, duplicated on purpose (same
 * tradeoff the team already made for lib/types.ts). Keep them in sync.
 *
 * Only ForecastBand uses this now — C's own chart set (WorkingIdleChart etc.)
 * has its own zinc/white palette in lib/chart-utils.ts.
 */
export const CHART_COLORS = {
  ink: "#16181a",
  steel: "#3d4550",
  mute: "#6c7480",
  line: "#d3cfc7",
  dust: "#edebe6",
  plate: "#ffffff",
  hivis: "#ff6b1a",
  hivisDeep: "#d8500a",
  ok: "#1f7a5c",
  warn: "#b8860b",
  alert: "#c1272d",
  busy: "#2b5f8a",
} as const;
