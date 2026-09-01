"use client";

import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/auth-client";
import type { Equipment, Paginated, Site } from "@/lib/types";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";

export default function ClientDashboard() {
  const { data: session } = useSession();
  const user = session?.user as { name?: string; companyName?: string } | undefined;

  // status=AVAILABLE because the plate is titled "Available to book" — listing
  // reserved or in-shop machines under that heading is a lie the client acts on.
  const fleet = useApi<Paginated<Equipment>>("/api/equipment", { limit: 6, status: "AVAILABLE" });
  const sites = useApi<Paginated<Site>>("/api/sites", { limit: 5 });

  return (
    <>
      <header className="mb-7">
        <p className="stamp text-stamp-sm text-hivis">{user?.companyName ?? "Client"}</p>
        <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
          {user?.name ?? "Dashboard"}
        </h1>
      </header>

      <div className="grid gap-5 sm:grid-cols-2">
        <Plate title="Available to book" meta={fleet.data ? `${fleet.data.total} machines` : undefined}>
          {fleet.loading ? (
            <p className="stamp text-stamp text-mute">Loading…</p>
          ) : (
            !fleet.data?.items.length ? (
              <p className="text-body text-steel">
                Every machine is out right now. Check back, or widen your dates when booking.
              </p>
            ) : (
            fleet.data?.items.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-mono text-data">{e.code}</p>
                  <p className="truncate text-note text-mute">{e.type.replace(/_/g, " ")}</p>
                </div>
                <StatusPill status={e.status} />
              </div>
            )))
          )}
        </Plate>

        <Plate title="Your sites" meta={sites.data ? `${sites.data.total}` : undefined}>
          {sites.loading ? (
            <p className="stamp text-stamp text-mute">Loading…</p>
          ) : sites.data?.items.length ? (
            <PlateRows>
              {sites.data.items.map((s) => (
                <PlateRow key={s.id} label={s.name} value={`${s.radiusMeters} m fence`} />
              ))}
            </PlateRows>
          ) : (
            <p className="text-body text-steel">
              No sites yet. Add one when you make your first booking.
            </p>
          )}
        </Plate>
      </div>

      <p className="stamp mt-8 text-stamp-sm text-mute">
        Placeholder — B7 replaces this with active rentals, next returns and spend.
      </p>
    </>
  );
}
