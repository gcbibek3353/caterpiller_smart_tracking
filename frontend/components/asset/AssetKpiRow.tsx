import type { EquipmentSummary } from "@/types/asset";

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

export function AssetKpiRow({ summary }: { summary: EquipmentSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiCard label="Runtime" value={`${summary.runtimeHours}h`} sub="Working hours" />
      <KpiCard label="Idle" value={`${summary.idleHours}h`} sub="Idle hours" />
      <KpiCard label="Utilization" value={`${summary.utilizationPct}%`} />
      <KpiCard
        label="Fuel"
        value={`${summary.currentFuelPct}%`}
        sub={`${summary.fuelUsedPct}% used (period)`}
      />
      <KpiCard
        label="Temperature"
        value={`${summary.currentTempC}°C`}
        sub={`Avg ${summary.avgTempC}°C`}
      />
    </div>
  );
}
