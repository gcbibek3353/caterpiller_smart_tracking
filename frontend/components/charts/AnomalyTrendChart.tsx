"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, COLOR, formatShortDate } from "@/lib/design-system";
import { axisLine, axisTick, ChartEmpty, ChartFrame, ChartTooltip, gridProps } from "./shared";

export interface AnomalyLike {
  detectedAt: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

const SEVERITY_FILL = { HIGH: COLOR.alert, MEDIUM: COLOR.warn, LOW: COLOR.mute } as const;

/**
 * Anomalies detected per day, last `days`, stacked by severity — is the
 * fleet getting worse or better, not just "how many are open right now."
 * Bucketing happens client-side: the anomaly list is small enough (a few
 * hundred rows at most) that a dedicated /trend endpoint would be one more
 * round-trip for no real gain.
 */
export function AnomalyTrendChart({ items, days = 14 }: { items: AnomalyLike[]; days?: number }) {
  const buckets = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const byDay = new Map<string, { date: string; HIGH: number; MEDIUM: number; LOW: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      byDay.set(key, { date: key, HIGH: 0, MEDIUM: 0, LOW: 0 });
    }
    for (const a of items) {
      const key = a.detectedAt.slice(0, 10);
      const bucket = byDay.get(key);
      if (bucket) bucket[a.severity]++;
    }
    return [...byDay.values()];
  }, [items, days]);

  const total = buckets.reduce((s, b) => s + b.HIGH + b.MEDIUM + b.LOW, 0);

  return (
    <ChartFrame title={`Anomalies — last ${days} days`} meta={`${total} detected`}>
      {total === 0 ? (
        <ChartEmpty message="Nothing detected in this window" />
      ) : (
        <ResponsiveContainer width="100%" height={CHART.height}>
          <BarChart data={buckets} margin={CHART.margin} barCategoryGap="15%">
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="date"
              tick={axisTick}
              tickLine={false}
              axisLine={axisLine}
              tickFormatter={(v: string) => formatShortDate(v)}
              interval={Math.ceil(days / 7) - 1}
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={CHART.axisWidth} allowDecimals={false} />
            <Tooltip
              content={({ active, payload, label }) => (
                <ChartTooltip
                  active={active}
                  label={typeof label === "string" ? formatShortDate(label) : label}
                  payload={payload?.map((p) => ({ name: p.dataKey as string, value: p.value, color: p.color }))}
                />
              )}
            />
            <Bar dataKey="HIGH" stackId="sev" fill={SEVERITY_FILL.HIGH} />
            <Bar dataKey="MEDIUM" stackId="sev" fill={SEVERITY_FILL.MEDIUM} />
            <Bar dataKey="LOW" stackId="sev" fill={SEVERITY_FILL.LOW} radius={CHART.barRadius} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartFrame>
  );
}
