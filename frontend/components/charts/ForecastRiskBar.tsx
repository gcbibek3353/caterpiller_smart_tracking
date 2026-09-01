"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, COLOR, SERIES } from "@/lib/design-system";
import { axisLine, axisTick, ChartEmpty, ChartFrame, ChartTooltip, gridProps } from "./shared";

export interface RiskBarPoint {
  equipmentType: string;
  utilizationPct: number;
}

/**
 * Next week's projected utilization by equipment type, company-wide — the
 * dashboard's own window into the forecasting pipeline (D9's full drill-down,
 * including every site, lives at /admin/forecast). One colour per risk tier,
 * the same 85%/35% thresholds recommend.ts already uses server-side, so this
 * bar and the sentence on the forecast page never disagree about what counts
 * as a shortage.
 */
export function ForecastRiskBar({ data }: { data: RiskBarPoint[] }) {
  const sorted = [...data].sort((a, b) => b.utilizationPct - a.utilizationPct);

  return (
    <ChartFrame title="Demand risk — next week" meta="by equipment type">
      {sorted.length === 0 ? (
        <ChartEmpty message="No forecast yet — run one from /admin/forecast" />
      ) : (
        <ResponsiveContainer width="100%" height={CHART.height}>
          <BarChart data={sorted} margin={CHART.margin} barCategoryGap="28%">
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="equipmentType"
              tick={axisTick}
              tickLine={false}
              axisLine={axisLine}
              tickFormatter={(v: string) => v.replace(/_/g, " ").slice(0, 4)}
              interval={0}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={CHART.axisWidth}
              domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ReferenceLine
              y={85}
              stroke={SERIES.limit}
              strokeDasharray="4 3"
              label={{ value: "85%", position: "right", fontSize: 10, fill: SERIES.limit }}
            />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  unit="%"
                  label={typeof label === "string" ? label.replace(/_/g, " ") : label}
                  payload={payload?.map((p) => ({ name: "Utilization", value: p.value, color: SERIES.primary }))}
                />
              )}
            />
            <Bar dataKey="utilizationPct" radius={CHART.barRadius} maxBarSize={40}>
              {sorted.map((d) => (
                <Cell
                  key={d.equipmentType}
                  fill={d.utilizationPct > 85 ? SERIES.limit : d.utilizationPct < 35 ? COLOR.mute : SERIES.working}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
