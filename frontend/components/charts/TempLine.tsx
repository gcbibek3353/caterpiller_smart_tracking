"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ANOMALY_CONFIG_OVERHEAT_MAX_C } from "./thresholds";
import { CHART_COLORS } from "./colors";
import { axisTick, ChartTooltip, gridProps } from "./shared";

export type TempPoint = { ts: string; engineTempC: number };

/**
 * C3 — engine temp with the overheat threshold drawn in. Matches
 * services/anomaly/config.ts's `overheat.maxTempC` on the backend so the
 * line on this chart is the same number that actually fires an anomaly.
 */
export function TempLine({ data, height = 240 }: { data: TempPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...gridProps} />
        <XAxis dataKey="ts" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_COLORS.line }} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} />
        <ReferenceLine
          y={ANOMALY_CONFIG_OVERHEAT_MAX_C}
          stroke={CHART_COLORS.alert}
          strokeDasharray="4 3"
          label={{ value: `${ANOMALY_CONFIG_OVERHEAT_MAX_C}°C`, fontSize: 10, fill: CHART_COLORS.alert }}
        />
        <Line type="monotone" dataKey="engineTempC" name="Temp °C" stroke={CHART_COLORS.steel} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
