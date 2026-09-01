import type { EquipmentSummary } from "@/types/asset";

const STATUS_STYLES: Record<string, string> = {
  CHECKED_OUT: "bg-green-100 text-green-800",
  AVAILABLE: "bg-blue-100 text-blue-800",
  MAINTENANCE: "bg-orange-100 text-orange-800",
  RESERVED: "bg-purple-100 text-purple-800",
  RETIRED: "bg-zinc-100 text-zinc-600",
};

const ENGINE_STATE_STYLES: Record<string, string> = {
  OFF: "bg-zinc-100 text-zinc-600",
  IDLE: "bg-amber-100 text-amber-800",
  WORKING: "bg-green-100 text-green-800",
};

export function AssetHeader({ summary }: { summary: EquipmentSummary }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-900">{summary.code}</h1>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[summary.status] ?? "bg-zinc-100"}`}
            >
              {summary.status.replace("_", " ")}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ENGINE_STATE_STYLES[summary.currentEngineState]}`}
            >
              Engine: {summary.currentEngineState}
            </span>
          </div>
          <p className="mt-1 text-lg text-zinc-700">{summary.name}</p>
          <p className="text-sm text-zinc-500">{summary.type.replace("_", " ")}</p>
        </div>
        <div className="space-y-1 text-sm text-zinc-600 sm:text-right">
          {summary.site && (
            <p>
              <span className="font-medium text-zinc-800">Site:</span> {summary.site.name}
            </p>
          )}
          {summary.operator && (
            <p>
              <span className="font-medium text-zinc-800">Operator:</span> {summary.operator.name}
            </p>
          )}
          {summary.booking && (
            <p>
              <span className="font-medium text-zinc-800">Booking:</span> {summary.booking.code}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
