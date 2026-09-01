"use client";

import { useMemo, useState } from "react";
import {
  DateRangeControls,
  type BucketSize,
  type DateRangeDays,
} from "@/components/asset/DateRangeControls";
import { AssetHeader } from "@/components/asset/AssetHeader";
import { AssetKpiRow } from "@/components/asset/AssetKpiRow";
import {
  EngineStateRibbon,
  FuelAreaChart,
  TemperatureLineChart,
  UsageLineChart,
  WorkingIdleChart,
} from "@/components/charts";
import { AssetMap } from "@/components/map/AssetMap";
import { AssetTimeline } from "@/components/timeline/AssetTimeline";
import { computeMovingAverage } from "@/lib/chart-utils";
import { useApi } from "@/lib/use-api";
import type { Anomaly, Paginated } from "@/lib/types";
import type {
  CheckEventRow,
  DailyRow,
  EngineState,
  EquipmentSummary,
  TimelineEvent,
  TimeseriesPoint,
  TrackPoint,
} from "@/types/asset";

/** Refuels aren't a stored flag — a jump upward between consecutive ticks is one. */
const REFUEL_JUMP_PCT = 5;

/**
 * The equipment detail view — sections 1-6 of steps.md §11.
 *
 * Lives here rather than in a route file because two routes render it:
 * `/equipment/[equipmentId]` (canonical) and `/asset/[assetId]`, which C7
 * shipped and which the demo script still names. Keeping one implementation
 * means the charts cannot drift apart between the two URLs.
 */
export function EquipmentDetail({ equipmentId }: { equipmentId: string }) {
  const assetId = equipmentId;

  const [days, setDays] = useState<DateRangeDays>(7);
  const [bucket, setBucket] = useState<BucketSize>("1h");

  // One range object per (days) change, so every request below shares an
  // identical window and the charts can't drift a few seconds apart.
  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  /**
   * The timeline deliberately does NOT follow the chart range. It answers
   * "what has happened to this machine", and the check-out that started the
   * current rental is usually older than the 7-day chart window — clamping it
   * to the charts would hide the one event most worth seeing.
   */
  const historyRange = useMemo(() => {
    const to = new Date();
    return {
      from: new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      to: to.toISOString(),
    };
  }, []);

  const base = `/api/equipment/${assetId}`;
  const summary = useApi<EquipmentSummary>(`${base}/summary`, range);
  const daily = useApi<DailyRow[]>(`${base}/daily`, range);
  const fuel = useApi<TimeseriesPoint[]>(`${base}/timeseries`, { ...range, metric: "fuel", bucket });
  const temp = useApi<TimeseriesPoint[]>(`${base}/timeseries`, { ...range, metric: "temp", bucket });
  const state = useApi<TimeseriesPoint[]>(`${base}/timeseries`, {
    ...range,
    metric: "engineState",
    bucket,
  });
  const track = useApi<TrackPoint[]>(`${base}/track`, range);
  const events = useApi<CheckEventRow[]>(`${base}/events`, historyRange);
  const anomalies = useApi<Paginated<Anomaly>>("/api/anomalies", {
    equipmentId: assetId,
    limit: 50,
  });

  const loading = summary.loading || daily.loading;

  // Memoised, not `daily.data ?? []`: a fresh [] every render re-runs every
  // useMemo below it, which is what the exhaustive-deps warning was about.
  const dailyRows = useMemo(() => daily.data ?? [], [daily.data]);

  const workingIdle = useMemo(
    () =>
      dailyRows.map((d) => ({
        date: d.date,
        workingHours: d.workingHours,
        idleHours: d.idleHours,
      })),
    [dailyRows],
  );

  const usageLine = useMemo(
    () => computeMovingAverage(dailyRows.map((d) => ({ date: d.date, engineHours: d.engineHours }))),
    [dailyRows],
  );

  const fuelSeries = useMemo(() => {
    const pts = fuel.data ?? [];
    return pts.map((p, i) => ({
      ts: p.ts,
      fuelPct: p.value,
      isRefuel: i > 0 && p.value - pts[i - 1].value > REFUEL_JUMP_PCT,
    }));
  }, [fuel.data]);

  const tempSeries = useMemo(
    () =>
      (temp.data ?? []).map((p) => ({
        ts: p.ts,
        engineTempC: p.value,
        engineState: p.engineState,
      })),
    [temp.data],
  );

  const ribbon = useMemo(
    () =>
      (state.data ?? [])
        .filter((p): p is TimeseriesPoint & { engineState: EngineState } => Boolean(p.engineState))
        .map((p) => ({ ts: p.ts, engineState: p.engineState })),
    [state.data],
  );

  // C12: scans and anomalies on one rail.
  const timeline = useMemo<TimelineEvent[]>(() => {
    const scans: TimelineEvent[] = (events.data ?? []).map((e) => ({
      id: `check-${e.id}`,
      ts: e.at,
      type: "check",
      title: e.type === "CHECK_OUT" ? "Checked out" : "Checked in",
      description: [
        `Booking ${e.bookingCode}`,
        e.meterHours != null ? `${e.meterHours.toFixed(1)}h meter` : null,
        e.fuelPct != null ? `${Math.round(e.fuelPct)}% fuel` : null,
        e.conditionNotes,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

    const flags: TimelineEvent[] = (anomalies.data?.items ?? []).map((a) => ({
      id: `anomaly-${a.id}`,
      ts: a.detectedAt,
      type: "anomaly",
      title: a.type.replace(/_/g, " "),
      description: a.message,
      severity: a.severity,
    }));

    return [...scans, ...flags];
  }, [events.data, anomalies.data]);

  const currentPosition = track.data?.at(-1);

  if (summary.error) {
    return (
      <ErrorPlate
        title={summary.error.status === 403 ? "Not your machine" : "Can't load this asset"}
        message={summary.error.message}
      />
    );
  }

  if (!summary.data) {
    return <p className="stamp text-stamp text-mute">Reading the plate…</p>;
  }

  return (
    <div className="space-y-5">
      <AssetHeader summary={summary.data} />
      <AssetKpiRow summary={summary.data} />

      <DateRangeControls
        days={days}
        bucket={bucket}
        onDaysChange={setDays}
        onBucketChange={setBucket}
        busy={loading}
        meta={`${dailyRows.length} days · ${summary.data.sampleCount.toLocaleString()} ticks`}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <WorkingIdleChart data={workingIdle} />
        <UsageLineChart data={usageLine} />
        <FuelAreaChart data={fuelSeries} />
        <TemperatureLineChart data={tempSeries} />
      </div>

      <EngineStateRibbon data={ribbon} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AssetMap
          breadcrumb={track.data ?? []}
          geofence={
            summary.data.site
              ? {
                  lat: summary.data.site.lat,
                  lng: summary.data.site.lng,
                  radiusMeters: summary.data.site.radiusMeters,
                  label: summary.data.site.name,
                }
              : undefined
          }
          currentPosition={currentPosition}
          height="420px"
        />
        <AssetTimeline events={timeline} title="Event timeline · 90 days" />
      </div>
    </div>
  );
}

function ErrorPlate({ title, message }: { title: string; message: string }) {
  return (
    <section className="rounded-plate border border-alert/40 bg-plate shadow-plate">
      <header className="border-b border-alert/25 bg-alert/6 px-4 py-2.5">
        <h1 className="stamp text-stamp text-alert">{title}</h1>
      </header>
      <p className="px-4 py-5 text-note text-steel">{message}</p>
    </section>
  );
}
