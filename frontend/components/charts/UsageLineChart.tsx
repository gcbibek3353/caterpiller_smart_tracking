import type { UsageLinePoint } from "@/types/asset";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEIGHT, formatShortDate } from "@/lib/chart-utils";

export interface UsageLineChartProps {
  data: UsageLinePoint[];
  title?: string;
}

export function UsageLineChart({ data, title = "Daily Usage + 7-day MA" }: UsageLineChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatShortDate(d.date) }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="chart-container" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="h" />
            <Tooltip
              formatter={(value, name) => [
                `${Number(value ?? 0)}h`,
                name === "engineHours" ? "Engine hours" : "7-day avg",
              ]}
            />
            <Legend
              formatter={(v) => (v === "engineHours" ? "Engine hours" : "7-day moving avg")}
            />
            <Line type="monotone" dataKey="engineHours" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line
              type="monotone"
              dataKey="movingAvg7d"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
