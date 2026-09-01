"use client";

import { useApi } from "@/lib/use-api";
import type { Equipment, Paginated } from "@/lib/types";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";

const STATUSES = ["AVAILABLE", "CHECKED_OUT", "RESERVED", "MAINTENANCE"] as const;

export default function AdminOverview() {
  // limit=200 pulls the whole fleet in one call — fine at 40 machines.
  // C11 replaces this with a real /api/analytics/fleet aggregate.
  const { data, error, loading } = useApi<Paginated<Equipment>>("/api/equipment", { limit: 200 });

  const items = data?.items ?? [];
  const countOf = (s: string) => items.filter((e) => e.status === s).length;

  return (
    <>
      <header className="mb-7">
        <p className="stamp text-[10px] text-hivis">Rental store</p>
        <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
          Fleet overview
        </h1>
      </header>

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-sm text-alert">
          {error.message}
        </p>
      ) : loading ? (
        <p className="stamp text-[11px] text-mute">Reading the fleet…</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Plate title="Fleet" meta={`${items.length} machines`}>
            <PlateRows>
              {STATUSES.map((s) => (
                <PlateRow
                  key={s}
                  label={s.replace(/_/g, " ")}
                  value={<span className="text-lg">{countOf(s)}</span>}
                />
              ))}
            </PlateRows>
          </Plate>

          <Plate title="Machines out now" meta={`${countOf("CHECKED_OUT")} out`}>
            {items.filter((e) => e.status === "CHECKED_OUT").slice(0, 6).map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-line/60 py-2 last:border-0">
                <span className="font-mono text-sm">{e.code}</span>
                <StatusPill status={e.status} />
              </div>
            ))}
          </Plate>

          <Plate title="Rate card" meta="per day">
            <PlateRows>
              {items.slice(0, 5).map((e) => (
                <PlateRow key={e.id} label={e.code} value={`$${e.dailyRate.toFixed(2)}`} />
              ))}
            </PlateRows>
          </Plate>
        </div>
      )}

      <p className="stamp mt-8 text-[10px] text-mute">
        Placeholder — C11 replaces this with utilisation, revenue and the status donut.
      </p>
    </>
  );
}
