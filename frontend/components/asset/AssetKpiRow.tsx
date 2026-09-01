import type { EquipmentSummary } from "@/types/asset";

/**
 * Section 2: the KPI row. Six headline numbers, so a row of stat tiles rather
 * than a chart — a bar chart of six unrelated units would be unreadable.
 * Values are mono because they are machine-produced.
 */
export function AssetKpiRow({ summary }: { summary: EquipmentSummary }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-plate border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Working" value={summary.runtimeHours.toFixed(1)} unit="h" />
      <Kpi label="Idle" value={summary.idleHours.toFixed(1)} unit="h" />
      <Kpi label="Utilisation" value={String(Math.round(summary.utilizationPct))} unit="%" />
      {/*
        `fuelUsedPct` is a SUM of daily percentages, so over a week it runs past
        100 and "434% used" reads as broken. Divided by 100 it is what it always
        was — the number of tank-fills burned in the period.
      */}
      <Kpi
        label="Fuel now"
        value={String(Math.round(summary.currentFuelPct))}
        unit="%"
        note={`${(summary.fuelUsedPct / 100).toFixed(1)} tanks burned`}
      />
      <Kpi
        label="Temp now"
        value={String(Math.round(summary.currentTempC))}
        unit="°C"
        note={`avg ${summary.avgTempC.toFixed(0)}°`}
        alert={summary.currentTempC > 105}
      />
      <Kpi label="Total hours" value={summary.totalEngineHours.toFixed(0)} unit="h" />
    </div>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  alert,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-plate p-4">
      <p className="stamp text-stamp-xs text-mute">{label}</p>
      <p className={`mt-1.5 font-mono text-data-xl ${alert ? "text-alert" : "text-ink"}`}>
        {value}
        {unit ? <span className="ml-0.5 text-data-sm text-mute">{unit}</span> : null}
      </p>
      <p className="mt-0.5 font-mono text-data-xs text-mute">{note ?? " "}</p>
    </div>
  );
}
