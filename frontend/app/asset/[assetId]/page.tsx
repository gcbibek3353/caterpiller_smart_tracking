"use client";

import { useMemo, useState } from "react";
import assetFixture from "@/fixtures/asset-data.json";
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
import type { AssetFixtureData } from "@/types/asset";

const fixture = assetFixture as AssetFixtureData;

export default function AssetPage() {
  const [days, setDays] = useState<DateRangeDays>(7);
  const [bucket, setBucket] = useState<BucketSize>("1h");

  const dailyData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return fixture.dailyUsage.filter((d) => new Date(d.date) >= cutoff);
  }, [days]);

  const usageLineData = useMemo(
    () =>
      computeMovingAverage(
        dailyData.map((d) => ({ date: d.date, engineHours: d.engineHours })),
      ),
    [dailyData],
  );

  const workingIdleData = useMemo(
    () =>
      dailyData.map((d) => ({
        date: d.date,
        workingHours: d.workingHours,
        idleHours: d.idleHours,
      })),
    [dailyData],
  );

  const currentPosition = fixture.track[fixture.track.length - 1];

  return (
    <div className="space-y-6">
      <AssetHeader summary={fixture.summary} />
      <AssetKpiRow summary={fixture.summary} />
      <DateRangeControls
        days={days}
        bucket={bucket}
        onDaysChange={setDays}
        onBucketChange={setBucket}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <WorkingIdleChart data={workingIdleData} />
        <UsageLineChart data={usageLineData} />
        <FuelAreaChart data={fixture.fuelSeries} />
        <TemperatureLineChart data={fixture.tempSeries} />
      </div>

      <EngineStateRibbon data={fixture.engineStateRibbon} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AssetMap
          breadcrumb={fixture.track}
          geofence={fixture.geofence}
          currentPosition={currentPosition}
          height="420px"
        />
        <AssetTimeline events={fixture.timeline} />
      </div>
    </div>
  );
}
