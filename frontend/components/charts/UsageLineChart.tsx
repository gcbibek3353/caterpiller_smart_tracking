"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UsageLinePoint } from "@/types/asset";
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

export interface UsageLineChartProps {
  data: UsageLinePoint[];
  title?: string;
}

/**
 * Emphasis, not two peer series: daily engine hours is the data, the 7-day
 * average is context. So the average recedes into the de-emphasis grey and
 * carries a dash pattern, rather than competing for a second bright hue.
 */
export function UsageLineChart({ data, title = "Engine hours per day" }: UsageLineChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));
  const latestAvg = data.at(-1)?.movingAvg7d;

  return (
    <ChartFrame
      title={title}
      meta={latestAvg !== undefined ? `${latestAvg.toFixed(1)}h 7-day avg` : undefined}
      footer={
        <ChartLegend>
          <LegendKey color={SERIES.primary} label="Engine hours" />
          <LegendKey color={SERIES.mute} label="7-day average" dashed />
        </ChartLegend>
      }
    >
      {chartData.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={CHART.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={CHART.axisWidth} unit="h" />
            <Tooltip content={(p) => <ChartTooltip {...p} unit="h" />} />
            {/* context first, so the series it supports draws on top of it */}
            <Line
              type="monotone"
              dataKey="movingAvg7d"
              name="7-day average"
              stroke={SERIES.mute}
              strokeWidth={CHART.strokeWidth}
              strokeDasharray="6 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="engineHours"
              name="Engine hours"
              stroke={SERIES.primary}
              strokeWidth={CHART.strokeWidth}
              dot={{ r: CHART.dotRadius, fill: SERIES.primary, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
