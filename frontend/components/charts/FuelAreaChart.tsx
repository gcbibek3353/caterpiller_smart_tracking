"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FuelAreaPoint } from "@/types/asset";
import { CHART, SERIES, formatTime } from "@/lib/design-system";
import {
  ChartEmpty,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  LegendKey,
  axisLine,
  axisTick,
  gridProps,
} from "./shared";

export interface FuelAreaChartProps {
  data: FuelAreaPoint[];
  title?: string;
}

/**
 * The fuel saw-tooth. A single series, so the title names it and no legend box
 * is needed for the area itself — the legend below exists only to explain the
 * refuel markers, which are a second kind of mark rather than a second series.
 */
export function FuelAreaChart({ data, title = "Fuel level" }: FuelAreaChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.ts) }));
  const refuels = chartData.filter((d) => d.isRefuel);
  const current = data.at(-1)?.fuelPct;

  return (
    <ChartFrame
      title={title}
      meta={current !== undefined ? `${Math.round(current)}% now` : undefined}
      footer={
        <ChartLegend>
          <LegendKey color={SERIES.primary} label="Fuel level" />
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-plate"
              style={{ background: SERIES.working }}
            />
            <span className="stamp text-stamp-xs text-mute">
              Refuel ×{refuels.length}
            </span>
          </span>
        </ChartLegend>
      }
    >
      {chartData.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={CHART.margin}>
            <defs>
              <linearGradient id="fuelFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.primary} stopOpacity={0.28} />
                <stop offset="100%" stopColor={SERIES.primary} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} minTickGap={28} />
            <YAxis
              domain={[0, 100]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={CHART.axisWidth}
              unit="%"
            />
            <Tooltip content={(p) => <ChartTooltip {...p} unit="%" />} />
            <Area
              type="monotone"
              dataKey="fuelPct"
              name="Fuel"
              stroke={SERIES.primary}
              strokeWidth={CHART.strokeWidth}
              fill="url(#fuelFill)"
            />
            {refuels.map((p) => (
              <ReferenceDot
                key={p.ts}
                x={p.label}
                y={p.fuelPct}
                r={5}
                fill={SERIES.working}
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
