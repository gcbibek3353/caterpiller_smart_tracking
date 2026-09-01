"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "./colors";
import { axisTick, ChartTooltip, gridProps } from "./shared";

export type FuelPoint = { ts: string; fuelPct: number };

/** A refuel is any tick where fuel jumped up rather than burned down — the saw-tooth's teeth. */
const REFUEL_JUMP_PCT = 8;

/**
 * C3 — fuel area with refuel markers. The simulator burns fuel down and
 * refuels below 12% (steps.md C2), so the raw line already saw-tooths;
 * this just calls out the jump-up points so they read as refuels, not noise.
 */
export function FuelArea({ data, height = 240 }: { data: FuelPoint[]; height?: number }) {
  const refuels = useMemo(
    () =>
      data
        .map((p, i) => ({ ...p, i }))
        .filter((p, idx, arr) => idx > 0 && p.fuelPct - arr[idx - 1]!.fuelPct >= REFUEL_JUMP_PCT),
    [data],
  );

  return (
    <div style={{ position: "relative", height }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="ts" tick={axisTick} tickLine={false} axisLine={{ stroke: CHART_COLORS.line }} />
          <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} width={32} />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="fuelPct"
            name="Fuel %"
            stroke={CHART_COLORS.busy}
            fill={CHART_COLORS.busy}
            fillOpacity={0.15}
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
      {/* Overlaid scatter for refuel markers — same x/y domain as the area chart above it. */}
      {refuels.length > 0 && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <ResponsiveContainer width="100%" height={height}>
            <ScatterChart margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <XAxis dataKey="ts" type="category" hide allowDuplicatedCategory={false} />
              <YAxis dataKey="fuelPct" type="number" domain={[0, 100]} hide />
              <Scatter data={refuels} fill={CHART_COLORS.hivis} shape="diamond" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
