import type { FuelAreaPoint } from "@/types/asset";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEIGHT, formatTime } from "@/lib/chart-utils";

export interface FuelAreaChartProps {
  data: FuelAreaPoint[];
  title?: string;
}

export function FuelAreaChart({ data, title = "Fuel Level" }: FuelAreaChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.ts) }));
  const refuelPoints = chartData.filter((d) => d.isRefuel);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="chart-container" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fuelGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={(value) => [`${Number(value ?? 0)}%`, "Fuel"]} />
            <Area
              type="monotone"
              dataKey="fuelPct"
              stroke="#0284c7"
              fill="url(#fuelGradient)"
              strokeWidth={2}
            />
            {refuelPoints.map((p) => (
              <ReferenceDot
                key={p.ts}
                x={p.label}
                y={p.fuelPct}
                r={6}
                fill="#16a34a"
                stroke="#fff"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600" />
        Green dots = refuel events
      </p>
    </div>
  );
}
