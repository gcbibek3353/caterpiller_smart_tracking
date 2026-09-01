import type { EngineState, EngineStateRibbonPoint } from "@/types/asset";
import { ENGINE_STATE_COLORS, formatTime } from "@/lib/chart-utils";

export interface EngineStateRibbonProps {
  data: EngineStateRibbonPoint[];
  title?: string;
}

export function EngineStateRibbon({ data, title = "Engine State" }: EngineStateRibbonProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
        <p className="text-sm text-zinc-500">No state data</p>
      </div>
    );
  }

  const segments = data.slice(0, -1).map((point, i) => {
    const next = data[i + 1];
    return {
      state: point.engineState,
      from: point.ts,
      to: next.ts,
      color: ENGINE_STATE_COLORS[point.engineState as EngineState],
    };
  });

  const segmentWidth = segments.length <= 1 ? "100%" : `${100 / segments.length}%`;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="flex h-10 w-full overflow-hidden rounded-lg border border-zinc-200">
        {segments.map((seg) => (
          <div
            key={`${seg.from}-${seg.to}`}
            className="h-full min-w-[8px]"
            style={{ width: segmentWidth, backgroundColor: seg.color }}
            title={`${seg.state}: ${formatTime(seg.from)} – ${formatTime(seg.to)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-600">
        {(Object.keys(ENGINE_STATE_COLORS) as EngineState[]).map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: ENGINE_STATE_COLORS[state] }}
            />
            {state}
          </span>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-zinc-400">
        <span>{formatTime(data[0].ts)}</span>
        <span>{formatTime(data[data.length - 1].ts)}</span>
      </div>
    </div>
  );
}
