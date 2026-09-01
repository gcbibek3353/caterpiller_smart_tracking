import type { TempLinePoint } from "@/types/asset";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_HEIGHT, formatTime } from "@/lib/chart-utils";

const OVERHEAT_THRESHOLD = 105;

export interface TemperatureLineChartProps {
  data: TempLinePoint[];
  title?: string;
  thresholdC?: number;
}

export function TemperatureLineChart({
  data,
  title = "Engine Temperature",
  thresholdC = OVERHEAT_THRESHOLD,
}: TemperatureLineChartProps) {
  const chartData = data.map((d) => ({ ...d, label: formatTime(d.ts) }));

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-zinc-800">{title}</h3>
      <div className="chart-container" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="°C" />
            <Tooltip
              formatter={(value) => [`${Number(value ?? 0)}°C`, "Temperature"]}
              labelFormatter={(_, payload) => {
                const state = payload?.[0]?.payload?.engineState;
                return state ? `State: ${state}` : "";
              }}
            />
            <ReferenceLine
              y={thresholdC}
              stroke="#ef4444"
              strokeDasharray="6 4"
              label={{ value: `${thresholdC}°C`, position: "insideTopRight", fill: "#ef4444" }}
            />
            <Line
              type="monotone"
              dataKey="engineTempC"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
