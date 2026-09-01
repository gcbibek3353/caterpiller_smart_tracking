"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WorkingIdleBarPoint } from "@/types/asset";
import { CHART, SERIES, formatShortDate } from "@/lib/design-system";
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

export interface WorkingIdleChartProps {
  data: WorkingIdleBarPoint[];
  title?: string;
}

/**
 * Part-to-whole per day: how much of the engine's running time was productive.
 * Stacked rather than grouped because working + idle *is* the engine hours
 * total — the stack height is itself a number worth reading.
 */
export function WorkingIdleChart({ data, title = "Working vs idle" }: WorkingIdleChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  const totalWorking = data.reduce((s, d) => s + d.workingHours, 0);
  const totalIdle = data.reduce((s, d) => s + d.idleHours, 0);
  const total = totalWorking + totalIdle;
  const idleShare = total > 0 ? Math.round((totalIdle / total) * 100) : 0;

  return (
    <ChartFrame
      title={title}
      meta={total > 0 ? `${idleShare}% idle` : undefined}
      footer={
        <ChartLegend>
          <LegendKey color={SERIES.working} label="Working" value={`${totalWorking.toFixed(1)}h`} />
          <LegendKey color={SERIES.idle} label="Idle" value={`${totalIdle.toFixed(1)}h`} />
        </ChartLegend>
      }
    >
      {chartData.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={CHART.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={CHART.axisWidth} unit="h" />
            <Tooltip
              cursor={{ fill: SERIES.grid, fillOpacity: 0.25 }}
              content={(p) => <ChartTooltip {...p} unit="h" />}
            />
            <Bar dataKey="workingHours" name="Working" stackId="hours" fill={SERIES.working} />
            <Bar
              dataKey="idleHours"
              name="Idle"
              stackId="hours"
              fill={SERIES.idle}
              radius={CHART.barRadius}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
