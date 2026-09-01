"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import type { DemandForecast, EquipmentType } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { ForecastBand, ForecastRiskBar } from "@/components/charts";

const selectClass =
  "rounded-plate border border-line bg-plate px-3 py-2 font-mono text-stamp-lg text-ink focus:border-ink";

/** "" is the company-wide sentinel in the <select> — translated to the API's "company" siteId value below. */
const COMPANY = "";

function seriesKey(equipmentType: string, siteId: string | null): string {
  return `${equipmentType}|${siteId ?? "company"}`;
}

const MODEL_LABEL: Record<string, string> = {
  "seasonal-naive": "Seasonal naive",
  "holt-winters": "Holt-Winters",
  "gbm-lag": "Gradient boosting",
};

/**
 * D9 — per-(site, type) forecast: shaded interval band, MASE + model +
 * low-confidence badges, recommendation list, 85% crossover week, and a
 * fleet-wide shortage radar across every series the last full run produced.
 */
export default function AdminForecast() {
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // One broad fetch — every series, 8-week horizon — everything below is
  // derived from it client-side rather than juggling several filtered calls.
  const { data, error, loading, refetch } = useApi<DemandForecast[]>("/api/forecast/demand", { weeks: 8 });

  const bySeries = useMemo(() => {
    const map = new Map<string, DemandForecast[]>();
    for (const row of data ?? []) {
      const key = seriesKey(row.equipmentType, row.siteId);
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.horizonWeek - b.horizonWeek);
    return map;
  }, [data]);

  const sites = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of data ?? []) {
      if (row.siteId) byId.set(row.siteId, row.siteName ?? row.siteId);
    }
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const [selectedSite, setSelectedSite] = useState<string>(COMPANY);
  const typesForSite = useMemo(() => {
    const set = new Set<EquipmentType>();
    for (const row of data ?? []) {
      const matchesSite = selectedSite === COMPANY ? row.siteId === null : row.siteId === selectedSite;
      if (matchesSite) set.add(row.equipmentType);
    }
    return [...set].sort();
  }, [data, selectedSite]);

  const [selectedType, setSelectedType] = useState<EquipmentType | null>(null);
  const activeType = selectedType && typesForSite.includes(selectedType) ? selectedType : typesForSite[0];
  const activeSiteId = selectedSite === COMPANY ? null : selectedSite;
  const rows = activeType ? bySeries.get(seriesKey(activeType, activeSiteId)) ?? [] : [];
  const first = rows[0];
  const crossover = rows.find((r) => r.utilization >= 0.85);
  const siteLabel = activeSiteId ? sites.find(([id]) => id === activeSiteId)?.[1] ?? activeSiteId : "Company-wide";

  // Fleet-wide shortage radar: every series' own week-1 row, ranked by gap.
  const shortages = useMemo(() => {
    const week1 = (data ?? []).filter((r) => r.horizonWeek === 1 && r.gapUnits > 0);
    return week1.sort((a, b) => b.gapUnits - a.gapUnits).slice(0, 6);
  }, [data]);

  // Every equipment type's next-week utilization at the CURRENT site
  // selection — a different chart shape (categorical bar) from the band
  // above, and it's the one place you can compare types against each other
  // rather than one type across time.
  const riskByType = useMemo(() => {
    return (data ?? [])
      .filter((r) => r.horizonWeek === 1 && (activeSiteId ? r.siteId === activeSiteId : r.siteId === null))
      .map((r) => ({ equipmentType: r.equipmentType, utilizationPct: Math.round(r.utilization * 1000) / 10 }));
  }, [data, activeSiteId]);

  // The recommendation sentence is often byte-identical week over week (a
  // flat model has nothing new to say) — collapsing consecutive duplicates
  // is the difference between one clear line and a wall of repeated text.
  const dedupedRecommendations = useMemo(() => {
    const out: { sentence: string; weeks: string[] }[] = [];
    for (const r of rows) {
      const last = out[out.length - 1];
      if (last && last.sentence === r.recommendation) last.weeks.push(r.periodStart);
      else out.push({ sentence: r.recommendation, weeks: [r.periodStart] });
    }
    return out;
  }, [rows]);

  const jumpTo = (row: DemandForecast) => {
    setSelectedSite(row.siteId ?? COMPANY);
    setSelectedType(row.equipmentType);
  };

  const runNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await api.post("/api/forecast/run", activeType ? { type: activeType, siteId: activeSiteId ?? undefined } : {});
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
          <p className="stamp text-stamp-sm text-hivis">Demand intelligence</p>
          <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
            Forecast
          </h1>
        </div>
        <div className="flex items-end gap-2">
          <select
            value={selectedSite}
            onChange={(e) => setSelectedSite(e.target.value)}
            className={selectClass}
            aria-label="Site"
          >
            <option value={COMPANY}>Company-wide</option>
            {sites.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {typesForSite.length > 0 ? (
            <select
              value={activeType ?? ""}
              onChange={(e) => setSelectedType(e.target.value as EquipmentType)}
              className={selectClass}
              aria-label="Equipment type"
            >
              {typesForSite.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          ) : null}
          <Button variant="secondary" loading={running} onClick={runNow}>
            Run this series
          </Button>
        </div>
      </header>

      {runError ? (
        <p className="mb-4 border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">{runError}</p>
      ) : null}

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">{error.message}</p>
      ) : loading ? (
        <p className="stamp text-stamp text-mute">Reading the forecast…</p>
      ) : (
        <div className="flex flex-col gap-6">
          {shortages.length > 0 && (
            <Plate title="Fleet-wide shortage radar" meta={`top ${shortages.length}`} tone="hivis">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {shortages.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => jumpTo(r)}
                    className="flex items-center justify-between gap-2 rounded-plate border border-line bg-plate px-3 py-2 text-left transition-colors hover:border-hivis"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-note font-medium text-ink">
                        {r.siteName ?? "Company-wide"}
                      </span>
                      <span className="stamp text-stamp-xs text-mute">{r.equipmentType.replace(/_/g, " ")}</span>
                    </span>
                    <span className="stamp shrink-0 rounded-plate border border-alert/40 bg-alert/12 px-2 py-0.5 text-stamp-xs text-alert">
                      SHORT {r.gapUnits}
                    </span>
                  </button>
                ))}
              </div>
            </Plate>
          )}

          {!activeType || rows.length === 0 ? (
            <Plate title="Forecast" meta="no data yet">
              <p className="text-body text-steel">
                Nothing generated yet for {siteLabel.toLowerCase()}
                {activeType ? ` — ${activeType.toLowerCase()}` : ""}. Hit &ldquo;Run this series&rdquo; once
                there are bookings to learn from.
              </p>
            </Plate>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
              <Plate
                title={`${siteLabel} — ${activeType.replace(/_/g, " ")} — ${rows.length}-week outlook`}
                meta={
                  <span className="flex items-center gap-2">
                    {first?.lowConfidence ? (
                      <span className="stamp rounded-plate border border-warn/40 bg-warn/15 px-2 py-0.5 text-stamp-xs text-warn">
                        LOW CONFIDENCE
                      </span>
                    ) : null}
                    <span
                      className={`stamp rounded-plate border px-2 py-0.5 text-stamp-xs ${
                        (first?.mase ?? 1) < 1 ? "border-ok/40 bg-ok/12 text-ok" : "border-warn/40 bg-warn/15 text-warn"
                      }`}
                    >
                      MASE {first?.mase?.toFixed(2) ?? "—"}
                    </span>
                    <span className="opacity-70">{MODEL_LABEL[first?.model ?? ""] ?? first?.model}</span>
                  </span>
                }
              >
                <ForecastBand
                  data={rows.map((r) => ({ weekStart: r.periodStart.slice(5, 10), predicted: r.predicted, lower: r.lower, upper: r.upper }))}
                />
                <p className="stamp mt-3 text-stamp-sm text-mute">
                  Shaded band = prediction interval, from the backtested residual spread — not decoration.
                </p>
              </Plate>

              <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-plate border border-line bg-plate p-4">
                    <p className="stamp text-stamp-sm text-mute">Fleet size</p>
                    <p className="mt-1 text-data-xl font-semibold text-ink">{first?.fleetSize ?? "—"}</p>
                  </div>
                  <div className="rounded-plate border border-line bg-plate p-4">
                    <p className="stamp text-stamp-sm text-mute">Utilization</p>
                    <p className="mt-1 text-data-xl font-semibold text-ink">
                      {first ? `${Math.round(first.utilization * 100)}%` : "—"}
                    </p>
                  </div>
                </div>

                <Plate title="First week ≥ 85% utilization" tone="hivis">
                  {crossover ? (
                    <p className="text-body text-ink">
                      Week of <span className="font-mono font-semibold">{crossover.periodStart}</span> —{" "}
                      <span className="font-mono font-semibold">{Math.round(crossover.utilization * 100)}%</span> projected.
                    </p>
                  ) : (
                    <p className="text-body text-steel">Stays under 85% for the full outlook — no shortage flagged.</p>
                  )}
                </Plate>

                <Plate title="Recommendations" meta={`${rows.length} weeks`}>
                  <ul className="flex flex-col gap-3">
                    {dedupedRecommendations.map((d) => (
                      <li key={d.weeks[0]} className="border-b border-line/60 pb-3 text-note leading-snug text-steel last:border-0 last:pb-0">
                        {d.sentence}
                        {d.weeks.length > 1 ? (
                          <span className="stamp ml-1.5 text-stamp-xs text-mute">
                            (same for weeks of {d.weeks[0]!.slice(5)}–{d.weeks[d.weeks.length - 1]!.slice(5)})
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Plate>
              </div>
            </div>
          )}

          {riskByType.length > 1 ? (
            <ForecastRiskBar data={riskByType} scope={`by type — ${siteLabel}`} />
          ) : null}
        </div>
      )}
    </>
  );
}
