"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useApi } from "@/lib/use-api";
import type { FleetDashboardData } from "@/types/asset";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";

const STATUS_COLORS: Record<string, string> = {
  CHECKED_OUT: "#16181a",
  AVAILABLE: "#1f7a5c",
  MAINTENANCE: "#b8860b",
  RESERVED: "#2b5f8a",
  RETIRED: "#6c7480",
};

function KpiPlate({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-plate border border-line bg-plate p-4">
      <p className="stamp text-[10px] text-mute">{label}</p>
      <p className={`mt-1.5 font-mono text-3xl font-semibold ${accent ?? "text-ink"}`}>{value}</p>
    </div>
  );
}

/** C11 — fleet dashboard, now reading the live /api/analytics/fleet endpoint (C6/D). */
export default function AdminDashboardPage() {
  const { data, error, loading } = useApi<FleetDashboardData>("/api/analytics/fleet");

  const donutData = (data?.statusDistribution ?? [])
    .filter((s) => s.status !== "RETIRED")
    .map((s) => ({
      name: s.status.replace(/_/g, " "),
      value: s.count,
      fill: STATUS_COLORS[s.status] ?? "#6c7480",
    }));

  const revenueFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(data?.revenue ?? 0);

  return (
    <>
      <header className="mb-7">
        <p className="stamp text-[10px] text-hivis">Rental store</p>
        <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
          Fleet Dashboard
        </h1>
        <p className="mt-1 text-sm text-steel">Operational overview — what requires attention right now</p>
      </header>

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-sm text-alert">{error.message}</p>
      ) : loading || !data ? (
        <p className="stamp text-[11px] text-mute">Reading the fleet…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiPlate label="Fleet utilization" value={`${data.fleetUtilizationPct}%`} accent="text-ok" />
            <KpiPlate label="Machines out" value={String(data.machinesOut)} accent="text-busy" />
            <KpiPlate
              label="Overdue"
              value={String(data.overdueCount)}
              accent={data.overdueCount > 0 ? "text-alert" : undefined}
            />
            <KpiPlate label="Revenue (YTD)" value={revenueFormatted} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Plate title="Requires attention" meta={`${data.attentionItems.length}`} className="lg:col-span-2">
              {data.attentionItems.length === 0 ? (
                <p className="text-sm text-steel">Nothing open right now — genuinely good news.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {data.attentionItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-start gap-3">
                        <StatusPill status={item.severity} kind="severity" />
                        <div>
                          <p className="text-sm font-medium text-ink">{item.title}</p>
                          <p className="mt-0.5 text-[13px] text-steel">{item.description}</p>
                        </div>
                      </div>
                      <Link
                        href={`/asset/${item.equipmentId}`}
                        className="stamp shrink-0 text-[10px] text-hivis underline-offset-4 hover:underline"
                      >
                        View →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </Plate>

            <Plate title="Status distribution">
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [Number(value ?? 0), String(name)]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                {donutData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: d.fill }} />
                    <span className="text-steel">{d.name}</span>
                    <span className="font-mono font-semibold text-ink">{d.value}</span>
                  </div>
                ))}
              </div>
            </Plate>
          </div>

          <PlateRows>
            <div className="grid gap-4 sm:grid-cols-3">
              <Plate title="Available">
                <PlateRows>
                  <PlateRow label="Machines" value={<span className="text-lg">{data.availableCount}</span>} />
                </PlateRows>
              </Plate>
              <Plate title="In maintenance">
                <PlateRows>
                  <PlateRow label="Machines" value={<span className="text-lg">{data.maintenanceCount}</span>} />
                </PlateRows>
              </Plate>
              <Plate title="Total fleet">
                <PlateRows>
                  <PlateRow label="Machines" value={<span className="text-lg">{data.totalMachines}</span>} />
                </PlateRows>
              </Plate>
            </div>
          </PlateRows>
        </div>
      )}
    </>
  );
}
