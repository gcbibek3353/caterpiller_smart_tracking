"use client";

import Link from "next/link";
import { StatusBar } from "@/components/charts";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";
import { formatCurrency, formatDateTime } from "@/lib/design-system";
import type { Anomaly, Equipment, Paginated } from "@/lib/types";
import type { FleetAnalytics } from "@/types/asset";
import { useApi } from "@/lib/use-api";

/**
 * C11 — the fleet overview, on C6's real `/api/analytics/fleet` aggregate.
 *
 * Five headline numbers get stat tiles rather than a chart: they carry
 * different units and a grouped bar of them would be unreadable. The only
 * actual chart here is the status mix, which is genuinely part-to-whole.
 */
export default function FleetOverview() {
  const fleet = useApi<FleetAnalytics>("/api/analytics/fleet");
  const open = useApi<Paginated<Anomaly>>("/api/anomalies", {
    status: "OPEN",
    limit: 6,
  });
  const out = useApi<Paginated<Equipment>>("/api/equipment", {
    status: "CHECKED_OUT",
    limit: 6,
  });

  if (fleet.error) {
    return (
      <>
        <PageHeader />
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-note text-alert">
          {fleet.error.message}
        </p>
      </>
    );
  }

  const f = fleet.data;

  return (
    <>
      <PageHeader />

      {/* ── headline numbers ─────────────────────────────────────────── */}
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-plate border border-line bg-line lg:grid-cols-5">
        <Stat
          label="Fleet utilisation"
          value={f ? String(Math.round(f.fleetUtilizationPct)) : "—"}
          unit="%"
          note="working ÷ engine hrs, 30d"
        />
        <Stat
          label="Machines out"
          value={f ? String(f.machinesOut) : "—"}
          note={f ? `of ${f.totalMachines} in fleet` : undefined}
        />
        <Stat
          label="Overdue"
          value={f ? String(f.overdueCount) : "—"}
          note="past return date"
          alert={Boolean(f && f.overdueCount > 0)}
        />
        <Stat label="Available" value={f ? String(f.availableCount) : "—"} note="ready to book" />
        <Stat
          label="Revenue"
          value={f ? formatCurrency(f.revenue) : "—"}
          note="returned bookings"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ── open anomalies ─────────────────────────────────────────── */}
        <Plate
          title="Needs attention"
          meta={open.data ? `${open.data.total} open` : undefined}
          className="lg:col-span-2"
        >
          {open.loading ? (
            <p className="stamp py-4 text-stamp-sm text-mute">Checking…</p>
          ) : (open.data?.items.length ?? 0) === 0 ? (
            <p className="stamp py-4 text-stamp-sm text-mute">
              Nothing open — the fleet is behaving
            </p>
          ) : (
            <ul>
              {open.data?.items.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 border-b border-line/60 py-2.5 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusPill status={a.severity} kind="severity" />
                      <span className="stamp text-stamp-sm text-ink">
                        {a.type.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-note text-steel">{a.message}</p>
                    <p className="font-mono text-data-xs text-mute">
                      {formatDateTime(a.detectedAt)} UTC
                    </p>
                  </div>
                  <Link
                    href={`/asset/${a.equipmentId}`}
                    className="stamp shrink-0 text-stamp-sm text-hivis underline-offset-4 hover:underline"
                  >
                    View →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Plate>

        {/* ── status mix ─────────────────────────────────────────────── */}
        <StatusBar data={f?.statusDistribution ?? []} />

        {/* ── machines currently out ─────────────────────────────────── */}
        <Plate title="Out now" meta={f ? `${f.machinesOut} machines` : undefined}>
          {(out.data?.items.length ?? 0) === 0 ? (
            <p className="stamp py-4 text-stamp-sm text-mute">Nothing checked out</p>
          ) : (
            <PlateRows>
              {out.data?.items.map((e) => (
                <PlateRow
                  key={e.id}
                  label={e.type.replace(/_/g, " ")}
                  value={
                    <Link
                      href={`/asset/${e.id}`}
                      className="text-hivis underline-offset-4 hover:underline"
                    >
                      {e.code}
                    </Link>
                  }
                />
              ))}
            </PlateRows>
          )}
        </Plate>

        <Plate title="Fleet condition" className="lg:col-span-2">
          <PlateRows>
            <PlateRow label="In maintenance" value={f ? String(f.maintenanceCount) : "—"} />
            <PlateRow label="Reserved" value={String(countOf(f, "RESERVED"))} />
            <PlateRow label="Retired" value={String(countOf(f, "RETIRED"))} />
            <PlateRow
              label="Total fleet"
              value={<span className="text-data-lg">{f ? f.totalMachines : "—"}</span>}
            />
          </PlateRows>
        </Plate>
      </div>
    </>
  );
}

function countOf(f: FleetAnalytics | null, status: string): number {
  return f?.statusDistribution.find((s) => s.status === status)?.count ?? 0;
}

function PageHeader() {
  return (
    <header className="mb-6">
      <p className="stamp text-stamp-xs text-hivis">Rental store</p>
      <h1 className="font-display text-title-lg font-bold uppercase text-ink">Fleet overview</h1>
    </header>
  );
}

function Stat({
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
      <p className="mt-0.5 text-note text-mute">{note ?? " "}</p>
    </div>
  );
}
