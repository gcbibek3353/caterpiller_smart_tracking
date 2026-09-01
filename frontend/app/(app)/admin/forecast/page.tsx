"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import type { DemandForecast, EquipmentType } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { ForecastBand } from "@/components/charts";

const selectClass =
  "rounded-plate border border-line bg-plate px-3 py-2 font-mono text-[12px] text-ink focus:border-ink";

/** D9 — per-type forecast: shaded interval band, MASE badge, recommendation list, 85% crossover week. */
export default function AdminForecast() {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const { data, error, loading, refetch } = useApi<DemandForecast[]>("/api/forecast/demand", { weeks: 8 });

  const byType = useMemo(() => {
    const map = new Map<EquipmentType, DemandForecast[]>();
    for (const row of data ?? []) {
      const list = map.get(row.equipmentType) ?? [];
      list.push(row);
      map.set(row.equipmentType, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.horizonWeek - b.horizonWeek);
    return map;
  }, [data]);

  const types = [...byType.keys()];
  const [selected, setSelected] = useState<EquipmentType | null>(null);
  const activeType = selected && byType.has(selected) ? selected : types[0];
  const rows = activeType ? byType.get(activeType) ?? [] : [];
  const first = rows[0];
  const crossover = rows.find((r) => r.utilization >= 0.85);

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await api.post("/api/forecast/run", {});
      await refetch();
    } catch (e) {
      setRunError(e instanceof ApiError ? e.message : "Forecast run failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-[10px] text-hivis">Demand intelligence</p>
          <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
            Forecast
          </h1>
        </div>
        <div className="flex items-end gap-2">
          {types.length > 0 ? (
            <select
              value={activeType ?? ""}
              onChange={(e) => setSelected(e.target.value as EquipmentType)}
              className={selectClass}
              aria-label="Equipment type"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          ) : null}
          <Button variant="secondary" loading={running} onClick={runNow}>
            Run forecast
          </Button>
        </div>
      </header>

      {runError ? (
        <p className="mb-4 border-l-2 border-alert bg-alert/6 px-4 py-3 text-sm text-alert">{runError}</p>
      ) : null}

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-sm text-alert">{error.message}</p>
      ) : loading ? (
        <p className="stamp text-[11px] text-mute">Reading the forecast…</p>
      ) : !activeType || rows.length === 0 ? (
        <Plate title="Forecast" meta="no data yet">
          <p className="text-sm text-steel">
            Nothing generated yet. Hit &ldquo;Run forecast&rdquo; once there are bookings to learn from.
          </p>
        </Plate>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <Plate
            title={`${activeType.replace(/_/g, " ")} — ${rows.length}-week outlook`}
            meta={
              <span className="flex items-center gap-2">
                <span
                  className={`stamp rounded-plate border px-2 py-0.5 text-[9px] ${
                    (first?.mase ?? 1) < 1 ? "border-ok/40 bg-ok/12 text-ok" : "border-warn/40 bg-warn/15 text-warn"
                  }`}
                >
                  MASE {first?.mase?.toFixed(2) ?? "—"}
                </span>
                <span className="opacity-70">{first?.model}</span>
              </span>
            }
          >
            <ForecastBand
              data={rows.map((r) => ({ weekStart: r.periodStart.slice(5, 10), predicted: r.predicted, lower: r.lower, upper: r.upper }))}
            />
            <p className="stamp mt-3 text-[10px] text-mute">
              Shaded band = prediction interval, from the backtested residual spread — not decoration.
            </p>
          </Plate>

          <div className="flex flex-col gap-5">
            <Plate title="First week ≥ 85% utilization" tone="hivis">
              {crossover ? (
                <p className="text-sm text-ink">
                  Week of <span className="font-mono font-semibold">{crossover.periodStart}</span> —{" "}
                  <span className="font-mono font-semibold">{Math.round(crossover.utilization * 100)}%</span> projected.
                </p>
              ) : (
                <p className="text-sm text-steel">Stays under 85% for the full outlook — no shortage flagged.</p>
              )}
            </Plate>

            <Plate title="Recommendations" meta={`${rows.length} weeks`}>
              <ul className="flex flex-col gap-3">
                {rows.map((r) => (
                  <li key={r.id} className="border-b border-line/60 pb-3 text-[13px] leading-snug text-steel last:border-0 last:pb-0">
                    {r.recommendation}
                  </li>
                ))}
              </ul>
            </Plate>
          </div>
        </div>
      )}
    </>
  );
}
