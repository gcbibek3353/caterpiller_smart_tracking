"use client";

import Link from "next/link";
import fleetFixture from "@/fixtures/fleet-dashboard.json";
import type { FleetDashboardData } from "@/types/asset";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const data = fleetFixture as FleetDashboardData;

const STATUS_COLORS: Record<string, string> = {
  CHECKED_OUT: "#22c55e",
  AVAILABLE: "#3b82f6",
  MAINTENANCE: "#f97316",
  RESERVED: "#a855f7",
  RETIRED: "#94a3b8",
};

const SEVERITY_STYLES = {
  HIGH: "border-red-200 bg-red-50",
  MEDIUM: "border-orange-200 bg-orange-50",
  LOW: "border-yellow-200 bg-yellow-50",
};

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent ?? "text-zinc-900"}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboardPage() {
  const donutData = data.statusDistribution
    .filter((s) => s.status !== "RETIRED")
    .map((s) => ({
      name: s.status.replace("_", " "),
      value: s.count,
      fill: STATUS_COLORS[s.status] ?? "#94a3b8",
    }));

  const revenueFormatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(data.revenue);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Fleet Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Operational overview — what requires attention right now
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Fleet Utilization"
          value={`${data.fleetUtilizationPct}%`}
          accent="text-green-700"
        />
        <KpiCard label="Machines Out" value={String(data.machinesOut)} accent="text-blue-700" />
        <KpiCard
          label="Overdue"
          value={String(data.overdueCount)}
          accent={data.overdueCount > 0 ? "text-red-600" : undefined}
        />
        <KpiCard label="Revenue (YTD)" value={revenueFormatted} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-zinc-800">Requires Attention</h2>
          <div className="space-y-3">
            {data.attentionItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg border p-4 ${SEVERITY_STYLES[item.severity]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-600">{item.description}</p>
                  </div>
                  <Link
                    href={`/asset/${item.equipmentCode}`}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
                  >
                    View →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-800">Status Distribution</h2>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [Number(value ?? 0), String(name)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {donutData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-zinc-600">{d.name}</span>
                <span className="font-semibold text-zinc-800">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Available" value={String(data.availableCount)} />
        <KpiCard label="In Maintenance" value={String(data.maintenanceCount)} />
        <KpiCard label="Total Fleet" value={String(data.totalMachines)} />
      </div>
    </div>
  );
}
