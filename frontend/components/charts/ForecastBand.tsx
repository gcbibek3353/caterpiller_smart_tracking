"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, SERIES } from "@/lib/design-system";
import { axisTick, gridProps, axisLine } from "./shared";

export type ForecastPoint = {
  weekStart: string;
  predicted: number;
  lower: number;
  upper: number;
};

/**
 * D9's own primitive, alongside C3's — a forecast line with its prediction
 * interval shaded around it. Recharts has no native "band" geometry, so this
 * is the standard trick: stack an invisible Area up to `lower`, then a
 * visible one spanning `upper - lower` on top of it, and the two together
 * read as one shaded band.
 */
export function ForecastBand({ data, height = CHART.height }: { data: ForecastPoint[]; height?: number }) {
  const chartData = data.map((p) => ({ ...p, band: p.upper - p.lower }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={CHART.margin}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="weekStart" tick={axisTick} tickLine={false} axisLine={axisLine} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={CHART.axisWidth} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as ForecastPoint | undefined;
            if (!row) return null;
            return (
              <div className="rounded-plate border border-line bg-plate px-3 py-2 text-data-xs shadow-raised">
                <p className="stamp mb-1 text-stamp-xs text-mute">{label}</p>
                <p className="font-mono text-ink">
                  predicted: <span className="font-semibold">{row.predicted.toFixed(1)}</span>
                </p>
                <p className="font-mono text-mute">
                  range: {row.lower.toFixed(1)} – {row.upper.toFixed(1)}
                </p>
              </div>
            );
          }}
        />
        {/* invisible riser up to the lower bound, then the visible band on top of it */}
        <Area dataKey="lower" stackId="band" stroke="none" fill="transparent" />
        <Area dataKey="band" stackId="band" stroke="none" fill={SERIES.primary} fillOpacity={0.15} />
        {/*
          The forecast line and its band are ONE series, so they share one hue —
          the band is that series' uncertainty, not a second thing. Red here
          would read as a threshold breach; in this system red only ever means
          a limit.
        */}
        <Line
          type="monotone"
          dataKey="predicted"
          stroke={SERIES.primary}
          strokeWidth={CHART.strokeWidth}
          dot={{ r: CHART.dotRadius, fill: SERIES.primary, stroke: "#fff", strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
