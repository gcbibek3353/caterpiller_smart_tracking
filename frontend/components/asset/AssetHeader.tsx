import type { EquipmentSummary } from "@/types/asset";
import { StatusPill } from "@/components/ui/status";

const ENGINE_STATE_TONE: Record<string, string> = {
  OFF: "border-mute/30 bg-mute/12 text-mute",
  IDLE: "border-warn/40 bg-warn/15 text-warn",
  WORKING: "border-ok/35 bg-ok/12 text-ok",
};

export function AssetHeader({ summary }: { summary: EquipmentSummary }) {
  return (
    <div className="rounded-plate border border-line bg-plate p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-ink">
              {summary.code}
            </h1>
            <StatusPill status={summary.status} kind="equipment" />
            <span className={`stamp inline-flex items-center rounded-plate border px-2 py-1 text-[10px] leading-none ${ENGINE_STATE_TONE[summary.currentEngineState]}`}>
              Engine: {summary.currentEngineState}
            </span>
          </div>
          <p className="mt-1.5 text-lg text-ink">{summary.name}</p>
          <p className="stamp text-[10px] text-mute">{summary.type.replace(/_/g, " ")}</p>
        </div>
        <div className="space-y-1 text-[13px] text-steel sm:text-right">
          {summary.site && (
            <p>
              <span className="stamp text-[9px] text-mute">Site </span>
              <span className="font-mono">{summary.site.name}</span>
            </p>
          )}
          {summary.operator && (
            <p>
              <span className="stamp text-[9px] text-mute">Operator </span>
              <span className="font-mono">{summary.operator.name}</span>
            </p>
          )}
          {summary.booking && (
            <p>
              <span className="stamp text-[9px] text-mute">Booking </span>
              <span className="font-mono">{summary.booking.code}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
