/**
 * ══════════════════════════════════════════════════════════════════════════
 *  DATA PLATE — the TypeScript half of the design system
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/globals.css` is the source of truth for anything expressible as a
 * class. This file exists for the consumers that take literal values instead:
 * Recharts (`stroke`, `fill`), Leaflet (`pathOptions`), and inline styles.
 *
 * The hexes below MIRROR the `@theme` block in globals.css. Keep them in sync
 * — same tradeoff the team already accepted for `lib/types.ts` vs the backend
 * contracts. If you change a colour, change it in both places.
 */

/** Surface, ink, accent and status tokens. Mirrors `@theme` in globals.css. */
export const COLOR = {
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

/**
 * The chart ramp — re-stepped from the status hues so adjacent data marks
 * actually separate. Validated against the #ffffff plate surface; see the
 * note in globals.css for the measured ΔE figures.
 *
 * `mute` is the de-emphasis channel: moving averages, OFF state, retired
 * machines. It is supposed to recede.
 */
export const SERIES = {
  primary: "#1f6fb2", // engine hours, fuel, temperature
  working: "#0f8a55",
  idle: "#c28a00",
  mute: "#9aa0a8",
  limit: "#c1272d", // threshold rules, critical marks
  grid: "#d3cfc7",
} as const;

/** Engine state is a status, so it draws from the ramp — one colour, one meaning. */
export const ENGINE_STATE_COLOR = {
  OFF: SERIES.mute,
  IDLE: SERIES.idle,
  WORKING: SERIES.working,
} as const;

/** Equipment status, for the fleet part-to-whole bar. Ordered as rendered. */
export const EQUIPMENT_STATUS_COLOR: Record<string, string> = {
  AVAILABLE: SERIES.working,
  CHECKED_OUT: SERIES.primary,
  RESERVED: SERIES.idle,
  MAINTENANCE: SERIES.limit,
  RETIRED: SERIES.mute,
};

/** Chart geometry. One set of numbers so every chart is built the same way. */
export const CHART = {
  /** Standard plot height. The wrapper must carry this — ResponsiveContainer measures its parent. */
  height: 260,
  heightTall: 320,
  /**
   * Left margin stays at 0 and the axis carries its own width. Pulling the
   * margin negative to reclaim Recharts' gutter clips the widest tick label —
   * "100%" renders as ".00%", which reads as a different number entirely.
   */
  margin: { top: 8, right: 20, left: 0, bottom: 0 },
  strokeWidth: 2,
  dotRadius: 3,
  /** 4px rounded data-ends, anchored to the baseline. */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  /** A 2px surface gap between stacked segments keeps them legible. */
  stackGap: 2,
  axisWidth: 48,
} as const;

/** Shared axis tick style — small mono numbers, matching the plate's data type. */
export const axisTick = {
  fontSize: 10,
  fontFamily: "var(--font-plex-mono, ui-monospace, monospace)",
  fill: COLOR.mute,
} as const;

/** Recessive grid: horizontal rules only, never a full graticule. */
export const gridProps = {
  stroke: SERIES.grid,
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const axisLine = { stroke: SERIES.grid } as const;

/* ── Formatters ─────────────────────────────────────────────────────────── */

/** "3 Sep" — for daily axes. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "14:20" — for intraday axes. UTC everywhere, per the H0.75 decision. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "3 Sep 14:20" — for timelines and event logs. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Money, whole units — the fleet deals in thousands, decimals are noise. */
export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
