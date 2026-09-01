"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TempLinePoint } from "@/types/asset";
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

const OVERHEAT_THRESHOLD = 105;

export interface TemperatureLineChartProps {
  data: TempLinePoint[];
  title?: string;
  thresholdC?: number;
}

/**
 * The series is deliberately NOT a hot colour. The one thing that must read as
 * danger here is the threshold rule, and a warm series sits too close to that
 * red to be told apart (ΔE 6.2 — below the legibility floor). Blue series,
 * red limit: the crossing is what signals trouble, not the hue of the line.
 */
export function TemperatureLineChart({
  data,
  title = "Engine temperature",
  thresholdC = OVERHEAT_THRESHOLD,
}: TemperatureLineChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.ts) }));
  const peak = data.length ? Math.max(...data.map((d) => d.engineTempC)) : undefined;
  const breached = peak !== undefined && peak > thresholdC;

  return (
    <ChartFrame
      title={title}
      meta={peak !== undefined ? `peak ${peak.toFixed(0)}°C` : undefined}
      footer={
        <ChartLegend>
          <LegendKey color={SERIES.primary} label="Engine temp" />
          <LegendKey color={SERIES.limit} label={`Limit ${thresholdC}°C`} dashed />
          {breached ? (
            <span className="stamp text-stamp-xs text-alert">⚠ Threshold exceeded</span>
          ) : null}
        </ChartLegend>
      }
    >
      {chartData.length === 0 ? (
        <ChartEmpty />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={CHART.margin}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={axisLine} minTickGap={28} />
            {/*
              The domain is forced past the threshold. Left to auto-scale, the
              105°C rule sits outside the plotted range whenever the machine is
              behaving — so the one reference the chart exists to show would be
              invisible exactly when it matters that it isn't being crossed.
            */}
            <YAxis
              domain={[0, (max: number) => Math.max(max * 1.1, thresholdC + 10)]}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={CHART.axisWidth}
              unit="°C"
            />
            <Tooltip content={(p) => <ChartTooltip {...p} unit="°C" />} />
            <ReferenceLine
              y={thresholdC}
              stroke={SERIES.limit}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `${thresholdC}°C`,
                position: "insideTopRight",
                fill: SERIES.limit,
                fontSize: 10,
              }}
            />
            <Line
              type="monotone"
              dataKey="engineTempC"
              name="Engine temp"
              stroke={SERIES.primary}
              strokeWidth={CHART.strokeWidth}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
