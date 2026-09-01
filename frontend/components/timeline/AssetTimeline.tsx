import type { TimelineEvent } from "@/types/asset";

const TYPE_ICONS: Record<TimelineEvent["type"], string> = {
  check: "✓",
  usage: "⚙",
  location: "📍",
  anomaly: "⚠",
  alert: "🔔",
};

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "border-l-yellow-400 bg-yellow-50",
  MEDIUM: "border-l-orange-500 bg-orange-50",
  HIGH: "border-l-red-600 bg-red-50",
};

const TYPE_COLORS: Record<TimelineEvent["type"], string> = {
  check: "border-l-blue-500 bg-blue-50",
  usage: "border-l-green-500 bg-green-50",
  location: "border-l-purple-500 bg-purple-50",
  anomaly: "border-l-red-600 bg-red-50",
  alert: "border-l-amber-500 bg-amber-50",
};

export interface AssetTimelineProps {
  events: TimelineEvent[];
  title?: string;
}

function formatEventTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function AssetTimeline({ events, title = "Event Timeline" }: AssetTimelineProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
  );

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-zinc-800">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">No events recorded</p>
      ) : (
        <ol className="relative ml-3 space-y-4 border-l border-zinc-200">
          {sorted.map((event) => {
            const colorClass =
              event.type === "anomaly" && event.severity
                ? SEVERITY_COLORS[event.severity]
                : TYPE_COLORS[event.type];

            return (
              <li key={event.id} className="ml-6">
                <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-200 bg-white text-xs">
                  {TYPE_ICONS[event.type]}
                </span>
                <div className={`rounded-r-lg border-l-4 p-3 ${colorClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{event.title}</p>
                    {event.severity && (
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          event.severity === "HIGH"
                            ? "bg-red-600 text-white"
                            : event.severity === "MEDIUM"
                              ? "bg-orange-500 text-white"
                              : "bg-yellow-400 text-yellow-900"
                        }`}
                      >
                        {event.severity}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="mt-1 text-xs text-zinc-600">{event.description}</p>
                  )}
                  <time className="mt-1 block text-xs text-zinc-400">{formatEventTime(event.ts)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
