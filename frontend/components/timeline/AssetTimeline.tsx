import type { TimelineEvent } from "@/types/asset";

const TYPE_ICONS: Record<TimelineEvent["type"], string> = {
  check: "✓",
  usage: "⚙",
  location: "📍",
  anomaly: "⚠",
  alert: "🔔",
};

const SEVERITY_TONE: Record<string, string> = {
  LOW: "border-l-mute bg-mute/6",
  MEDIUM: "border-l-warn bg-warn/8",
  HIGH: "border-l-alert bg-alert/8",
};

const TYPE_TONE: Record<TimelineEvent["type"], string> = {
  check: "border-l-busy bg-busy/8",
  usage: "border-l-ok bg-ok/8",
  location: "border-l-busy bg-busy/8",
  anomaly: "border-l-alert bg-alert/8",
  alert: "border-l-warn bg-warn/8",
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
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );

  return (
    <div className="rounded-plate border border-line bg-plate p-4">
      <h3 className="stamp mb-4 text-[11px] text-ink">{title}</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-steel">No events recorded</p>
      ) : (
        <ol className="relative ml-3 space-y-4 border-l border-line">
          {sorted.map((event) => {
            const colorClass =
              event.type === "anomaly" && event.severity
                ? SEVERITY_TONE[event.severity]
                : TYPE_TONE[event.type];

            return (
              <li key={event.id} className="ml-6">
                <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-plate text-xs">
                  {TYPE_ICONS[event.type]}
                </span>
                <div className={`rounded-r-plate border-l-4 p-3 ${colorClass}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{event.title}</p>
                    {event.severity && (
                      <span
                        className={`stamp shrink-0 rounded-plate px-1.5 py-0.5 text-[9px] ${
                          event.severity === "HIGH"
                            ? "bg-alert text-plate"
                            : event.severity === "MEDIUM"
                              ? "bg-warn text-plate"
                              : "bg-mute text-plate"
                        }`}
                      >
                        {event.severity}
                      </span>
                    )}
                  </div>
                  {event.description && (
                    <p className="mt-1 text-[12px] text-steel">{event.description}</p>
                  )}
                  <time className="stamp mt-1 block text-[9px] text-mute">{formatEventTime(event.ts)}</time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
