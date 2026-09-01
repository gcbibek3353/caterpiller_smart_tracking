"use client";

import type { EngineState, EngineStateRibbonPoint } from "@/types/asset";
import { ENGINE_STATE_COLOR, formatTime } from "@/lib/design-system";
import { ChartEmpty, ChartFrame, ChartLegend, LegendKey } from "./shared";

export interface EngineStateRibbonProps {
  data: EngineStateRibbonPoint[];
  title?: string;
}

const STATES: EngineState[] = ["WORKING", "IDLE", "OFF"];

/**
 * The duty-cycle ribbon: one continuous bar where colour is the engine state
 * over time. Not a Recharts chart — it's a flex strip, which is both cheaper
 * and sharper than forcing a categorical timeline through a plotting library.
 */
export function EngineStateRibbon({ data, title = "Engine state" }: EngineStateRibbonProps) {
  if (data.length < 2) {
    return (
      <ChartFrame title={title} height={72}>
        <ChartEmpty message="Not enough ticks to draw a duty cycle" />
      </ChartFrame>
    );
  }

  const segments = data.slice(0, -1).map((point, i) => ({
    state: point.engineState,
    from: point.ts,
    to: data[i + 1].ts,
  }));

  const share = STATES.map((state) => ({
    state,
    pct: Math.round((segments.filter((s) => s.state === state).length / segments.length) * 100),
  }));

  return (
    <ChartFrame
      title={title}
      meta={`${formatTime(data[0].ts)} – ${formatTime(data[data.length - 1].ts)}`}
      height={64}
      footer={
        <ChartLegend>
          {share.map(({ state, pct }) => (
            <LegendKey
              key={state}
              color={ENGINE_STATE_COLOR[state]}
              label={state}
              value={`${pct}%`}
            />
          ))}
        </ChartLegend>
      }
    >
      <div
        className="flex h-full w-full overflow-hidden rounded-plate border border-line"
        role="img"
        aria-label={share.map((s) => `${s.state} ${s.pct}%`).join(", ")}
      >
        {segments.map((seg) => (
          <div
            key={`${seg.from}-${seg.to}`}
            className="h-full"
            style={{
              width: `${100 / segments.length}%`,
              backgroundColor: ENGINE_STATE_COLOR[seg.state as EngineState],
            }}
            title={`${seg.state}: ${formatTime(seg.from)} – ${formatTime(seg.to)}`}
          />
        ))}
      </div>
    </ChartFrame>
  );
}
