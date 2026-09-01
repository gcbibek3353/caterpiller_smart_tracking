"use client";

import { useMemo } from "react";
import { ENGINE_STATE_COLOR } from "./colors";

export type RibbonTick = { ts: string; engineState: "OFF" | "IDLE" | "WORKING" };

/**
 * C3 — engine-state ribbon. Not a Recharts primitive on purpose: a run of
 * contiguous same-state ticks is just a proportionally-sized flex segment,
 * and CSS handles that better than forcing an SVG chart to draw a Gantt bar.
 */
export function EngineStateRibbon({ data, height = 28 }: { data: RibbonTick[]; height?: number }) {
  const segments = useMemo(() => {
    if (data.length === 0) return [];
    const out: { state: RibbonTick["engineState"]; count: number; from: string; to: string }[] = [];
    for (const tick of data) {
      const last = out[out.length - 1];
      if (last && last.state === tick.engineState) {
        last.count += 1;
        last.to = tick.ts;
      } else {
        out.push({ state: tick.engineState, count: 1, from: tick.ts, to: tick.ts });
      }
    }
    return out;
  }, [data]);

  if (segments.length === 0) {
    return <p className="stamp text-[10px] text-mute">No telemetry in this window</p>;
  }

  return (
    <div>
      <div className="flex overflow-hidden rounded-plate border border-line" style={{ height }}>
        {segments.map((s, i) => (
          <div
            key={i}
            title={`${s.state} · ${s.from} → ${s.to}`}
            style={{ flexGrow: s.count, background: ENGINE_STATE_COLOR[s.state] }}
            className="h-full first:rounded-l-plate last:rounded-r-plate"
          />
        ))}
      </div>
      <div className="stamp mt-2 flex gap-4 text-[9px] text-mute">
        {(Object.keys(ENGINE_STATE_COLOR) as (keyof typeof ENGINE_STATE_COLOR)[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: ENGINE_STATE_COLOR[s] }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
