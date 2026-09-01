import type { WorkingIdleBarPoint } from "@/types/asset";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEIGHT, formatShortDate } from "@/lib/chart-utils";

export interface WorkingIdleChartProps {
  data: WorkingIdleBarPoint[];
  title?: string;
}

export function WorkingIdleChart({ data, title = "Working vs Idle" }: WorkingIdleChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="chart-container" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="h" />
            <Tooltip
              formatter={(value, name) => [
                `${Number(value ?? 0)}h`,
                name === "workingHours" ? "Working" : "Idle",
              ]}
            />
            <Legend formatter={(v) => (v === "workingHours" ? "Working" : "Idle")} />
            <Bar dataKey="workingHours" stackId="a" fill="#22c55e" />
            <Bar dataKey="idleHours" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
