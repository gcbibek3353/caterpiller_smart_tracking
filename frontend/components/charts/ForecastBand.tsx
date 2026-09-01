"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS } from "./colors";
import { axisTick, gridProps } from "./shared";

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
export function ForecastBand({ data, height = 260 }: { data: ForecastPoint[]; height?: number }) {
  const chartData = data.map((p) => ({ ...p, band: p.upper - p.lower }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="weekStart" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_COLORS.line }} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as ForecastPoint | undefined;
            if (!row) return null;
            return (
              <div className="rounded-plate border border-line bg-plate px-3 py-2 text-[11px] shadow-md">
                <p className="stamp mb-1 text-[9px] text-mute">{label}</p>
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
        <Area dataKey="band" stackId="band" stroke="none" fill={CHART_COLORS.busy} fillOpacity={0.15} />
        <Line type="monotone" dataKey="predicted" stroke={CHART_COLORS.hivis} strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
