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
import { CHART_COLORS } from "./colors";
import { axisTick, ChartTooltip, gridProps } from "./shared";

export type WorkIdlePoint = { date: string; workingHours: number; idleHours: number };

/**
 * C3 — stacked bar: working vs idle hours per day.
 * Recharts' ResponsiveContainer needs a parent with an explicit height —
 * callers must wrap this in a div with a set height (or pass `height`).
 */
export function WorkIdleBar({ data, height = 240 }: { data: WorkIdlePoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_COLORS.line }} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={36} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="workingHours" name="Working" stackId="h" fill={CHART_COLORS.ok} radius={[0, 0, 0, 0]} />
        <Bar dataKey="idleHours" name="Idle" stackId="h" fill={CHART_COLORS.warn} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
