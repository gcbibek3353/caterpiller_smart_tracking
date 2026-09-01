/**
 * Recharts takes real colour values as props, not Tailwind classes — this is
 * the "data plate" palette from app/globals.css, duplicated on purpose (same
 * tradeoff the team already made for lib/types.ts). Keep them in sync.
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

export const ENGINE_STATE_COLOR: Record<"OFF" | "IDLE" | "WORKING", string> = {
  OFF: CHART_COLORS.mute,
  IDLE: CHART_COLORS.warn,
  WORKING: CHART_COLORS.ok,
};
