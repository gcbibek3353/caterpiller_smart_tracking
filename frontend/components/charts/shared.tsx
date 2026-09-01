import { CHART_COLORS } from "./colors";

/** Shared axis tick styling — small mono numbers, matching the plate's data typography. */
export const axisTick = { fontSize: 10, fontFamily: "var(--font-plex-mono, monospace)", fill: CHART_COLORS.mute };

export const gridProps = { stroke: CHART_COLORS.line, strokeDasharray: "3 3", vertical: false };

/** One tooltip look for every chart in the folder. */
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-plate border border-line bg-plate px-3 py-2 text-[11px] shadow-md">
      {label ? <p className="stamp mb-1 text-[9px] text-mute">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 font-mono text-ink">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
}
