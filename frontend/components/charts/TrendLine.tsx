"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS } from "./colors";
import { axisTick, ChartTooltip, gridProps } from "./shared";

export type TrendPoint = { ts: string; value: number };

/** Trailing simple moving average — pure, no chart dependency. */
export function movingAverage(points: TrendPoint[], window: number): (number | null)[] {
  return points.map((_, i) => {
    if (i < window - 1) return null;
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += points[j]!.value;
    return sum / window;
  });
}

/**
 * C3 — line + 7-day moving average. Generic over any single metric (engine
 * hours, utilization, whatever a caller feeds it) so B/D can reuse it rather
 * than each hand-rolling their own trend line.
 */
export function TrendLine({
  data,
  label = "Value",
  window = 7,
  height = 240,
}: {
  data: TrendPoint[];
  label?: string;
  window?: number;
  height?: number;
}) {
  const chartData = useMemo(() => {
    const ma = movingAverage(data, window);
    return data.map((p, i) => ({ ts: p.ts, [label]: p.value, [`${window}-day avg`]: ma[i] }));
  }, [data, window, label]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="ts" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_COLORS.line }} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey={label} stroke={CHART_COLORS.busy} strokeWidth={1.5} dot={false} />
        <Line
          type="monotone"
          dataKey={`${window}-day avg`}
          stroke={CHART_COLORS.hivis}
          strokeWidth={2}
          dot={false}
          strokeDasharray="4 3"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
