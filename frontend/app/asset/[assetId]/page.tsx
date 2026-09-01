"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/lib/use-api";
import type { Anomaly, Equipment, Paginated } from "@/lib/types";
import { AssetHeader } from "@/components/asset/AssetHeader";
import { AssetKpiRow } from "@/components/asset/AssetKpiRow";
import {
  DateRangeControls,
  type BucketSize,
  type DateRangeDays,
} from "@/components/asset/DateRangeControls";
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
import type {
  DailyUsageRow,
  EquipmentSummary,
  FuelAreaPoint,
  MapPosition,
  TempLinePoint,
  TimelineEvent,
} from "@/types/asset";

type TimeseriesResponse = { ts: string; value: number; engineState?: string }[];
type TrackResponse = { lat: number; lng: number; ts: string }[];

/**
 * `assetId` in the URL is whatever the caller had handy — the admin
 * dashboard's "requires attention" list links by real equipment id, but a
 * human typing a code (`EXC-1007`) into the address bar is exactly as valid.
 * Try it as an id first (one request, matches most navigation in the app);
 * fall back to a code search only if that 404s.
 */
function useResolvedEquipmentId(raw: string) {
  const direct = useApi<Equipment>(raw ? `/api/equipment/${raw}` : null);
  const needsSearch = direct.error?.status === 404;
  const search = useApi<Paginated<Equipment>>(needsSearch ? "/api/equipment" : null, {
    q: raw,
    limit: 5,
  });

  const byCode = search.data?.items.find((e) => e.code.toLowerCase() === raw.toLowerCase());
  const equipmentId = direct.data?.id ?? byCode?.id ?? search.data?.items[0]?.id;
  const loading = direct.loading || (needsSearch && search.loading);
  const notFound = !loading && !equipmentId && (direct.error ? !needsSearch || search.data?.items.length === 0 : false);

  return { equipmentId, loading, notFound: Boolean(notFound) };
}

function windowFor(days: DateRangeDays) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AssetPage() {
  const params = useParams<{ assetId: string }>();
  const assetId = params.assetId ?? "";
  const [days, setDays] = useState<DateRangeDays>(7);
  const [bucket, setBucket] = useState<BucketSize>("1h");

  const { equipmentId, loading: resolving, notFound } = useResolvedEquipmentId(assetId);
  const { from, to } = useMemo(() => windowFor(days), [days]);

  const summary = useApi<EquipmentSummary>(equipmentId ? `/api/equipment/${equipmentId}/summary` : null, { from, to });
  const daily = useApi<DailyUsageRow[]>(equipmentId ? `/api/equipment/${equipmentId}/daily` : null, { from, to });
  const fuel = useApi<TimeseriesResponse>(equipmentId ? `/api/equipment/${equipmentId}/timeseries` : null, {
    from,
    to,
    bucket,
    metric: "fuel",
  });
  const temp = useApi<TimeseriesResponse>(equipmentId ? `/api/equipment/${equipmentId}/timeseries` : null, {
    from,
    to,
    bucket,
    metric: "temp",
  });
  const track = useApi<TrackResponse>(equipmentId ? `/api/equipment/${equipmentId}/track` : null, { from, to });
  const anomalies = useApi<Paginated<Anomaly>>(
    equipmentId ? "/api/anomalies" : null,
    { equipmentId: equipmentId, from, to, limit: 20 },
  );

  const usageLineData = useMemo(
    () => computeMovingAverage((daily.data ?? []).map((d) => ({ date: d.date, engineHours: d.engineHours }))),
    [daily.data],
  );

  const workingIdleData = useMemo(
    () => (daily.data ?? []).map((d) => ({ date: d.date, workingHours: d.workingHours, idleHours: d.idleHours })),
    [daily.data],
  );

  const fuelSeries: FuelAreaPoint[] = useMemo(
    () => (fuel.data ?? []).map((p) => ({ ts: p.ts, fuelPct: p.value })),
    [fuel.data],
  );
  const tempSeries: TempLinePoint[] = useMemo(
    () => (temp.data ?? []).map((p) => ({ ts: p.ts, engineTempC: p.value })),
    [temp.data],
  );
  const engineStateRibbon = useMemo(
    () =>
      (fuel.data ?? [])
        .filter((p) => p.engineState)
        .map((p) => ({ ts: p.ts, engineState: p.engineState as "OFF" | "IDLE" | "WORKING" })),
    [fuel.data],
  );

  const trackPoints: MapPosition[] = track.data ?? [];
  const currentPosition = trackPoints[trackPoints.length - 1];

  const timeline: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = (anomalies.data?.items ?? []).map((a) => ({
      id: a.id,
      ts: a.detectedAt,
      type: "anomaly",
      title: `${a.type.replace(/_/g, " ")}`,
      description: a.message,
      severity: a.severity,
    }));
    const booking = summary.data?.booking;
    if (booking?.checkoutAt) {
      events.push({ id: `${booking.id}-checkout`, ts: booking.checkoutAt, type: "check", title: `Checked out — ${booking.code}` });
    }
    if (booking?.checkinAt) {
      events.push({ id: `${booking.id}-checkin`, ts: booking.checkinAt, type: "check", title: `Checked in — ${booking.code}` });
    }
    return events;
  }, [anomalies.data, summary.data]);

  if (!equipmentId && !resolving) {
    return (
      <div className="rounded-plate border border-line bg-plate p-6">
        <p className="stamp text-[11px] text-alert">
          {notFound ? `No equipment matches "${assetId}"` : "Could not load this asset"}
        </p>
      </div>
    );
  }

  if (resolving || summary.loading || !summary.data) {
    return <p className="stamp text-[11px] text-mute">Reading the asset…</p>;
  }

  return (
    <div className="space-y-6">
      <AssetHeader summary={summary.data} />
      <AssetKpiRow summary={summary.data} />
      <DateRangeControls days={days} bucket={bucket} onDaysChange={setDays} onBucketChange={setBucket} />

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkingIdleChart data={workingIdleData} />
        <UsageLineChart data={usageLineData} />
        <FuelAreaChart data={fuelSeries} />
        <TemperatureLineChart data={tempSeries} />
      </div>

      <EngineStateRibbon data={engineStateRibbon} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AssetMap
          breadcrumb={trackPoints}
          geofence={summary.data.site ? { ...summary.data.site, label: summary.data.site.name } : undefined}
          currentPosition={currentPosition}
          height="420px"
        />
        <AssetTimeline events={timeline} />
      </div>
    </div>
  );
}
