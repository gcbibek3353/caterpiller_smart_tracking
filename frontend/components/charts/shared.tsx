import type { ReactNode } from "react";
import { CHART } from "@/lib/design-system";

export { axisTick, gridProps, axisLine } from "@/lib/design-system";

/**
 * Every chart in this folder sits in the same frame: a plate with a stamped
 * title, an optional meta value on the right, and a fixed-height plot area.
 * Using one frame is what makes five different charts read as one system.
 */
export function ChartFrame({
  title,
  meta,
  children,
  footer,
  height = CHART.height,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  height?: number;
}) {
  return (
    <section className="rounded-plate border border-line bg-plate shadow-plate">
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5">
        <h3 className="stamp text-stamp text-steel">{title}</h3>
        {meta ? <div className="stamp text-stamp-sm text-mute">{meta}</div> : null}
      </header>
      <div className="chart-container p-3" style={{ height: height + 24 }}>
        {children}
      </div>
      {footer ? <div className="border-t border-line/60 px-4 py-2">{footer}</div> : null}
    </section>
  );
}

/**
 * A legend swatch + label. Identity is never colour alone — every series that
 * carries a colour also carries this label.
 */
export function LegendKey({
  color,
  label,
  value,
  dashed = false,
}: {
  color: string;
  label: string;
  value?: ReactNode;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-0.5 w-3.5 shrink-0"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
            : { background: color }
        }
      />
      <span className="stamp text-stamp-xs text-mute">{label}</span>
      {value !== undefined ? <span className="font-mono text-data-xs text-ink">{value}</span> : null}
    </span>
  );
}

export function ChartLegend({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">{children}</div>;
}

/**
 * One tooltip look for every chart in the folder.
 *
 * The payload type is deliberately loose: Recharts hands `content` its own
 * generic `Payload<ValueType, NameType>[]`, where a name can be a number, so a
 * stricter signature here just fails to accept the thing Recharts passes.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = "",
}: {
  active?: boolean;
  payload?: readonly { name?: string | number; value?: unknown; color?: string }[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-plate border border-line bg-plate px-3 py-2 shadow-raised">
      {label ? <p className="stamp mb-1 text-stamp-xs text-mute">{label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 font-mono text-data-xs text-ink">
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: p.color }}
          />
          {p.name}:{" "}
          <span className="font-semibold">
            {typeof p.value === "number" ? p.value.toFixed(1) : String(p.value ?? "—")}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Shown in a ChartFrame when a range genuinely has no rows behind it. */
export function ChartEmpty({ message = "No data in this range" }: { message?: string }) {
  return (
    <div className="grid h-full place-items-center">
      <p className="stamp text-stamp-sm text-mute">{message}</p>
    </div>
  );
}
