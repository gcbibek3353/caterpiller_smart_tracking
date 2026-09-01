import type { TimelineEvent } from "@/types/asset";
import { StatusPill } from "@/components/ui/status";
import { formatDateTime } from "@/lib/design-system";

export interface AssetTimelineProps {
  events: TimelineEvent[];
  title?: string;
}

/** The rail marker's colour. Anomalies inherit their severity from the status ramp. */
const TYPE_RAIL: Record<TimelineEvent["type"], string> = {
  check: "bg-busy",
  usage: "bg-ok",
  location: "bg-steel",
  anomaly: "bg-alert",
  alert: "bg-warn",
};

const SEVERITY_RAIL: Record<string, string> = {
  LOW: "bg-mute",
  MEDIUM: "bg-warn",
  HIGH: "bg-alert",
};

/**
 * Section 5: check events and anomalies interleaved on one rail, newest first
 * — an operator asking "what happened to this machine" reads down from now.
 */
export function AssetTimeline({ events, title = "Event timeline" }: AssetTimelineProps) {
  const sorted = [...events].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );

  return (
    <section className="rounded-plate border border-line bg-plate shadow-plate">
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5">
        <h3 className="stamp text-stamp text-steel">{title}</h3>
        <span className="font-mono text-data-xs text-mute">{sorted.length}</span>
      </header>

      {sorted.length === 0 ? (
        <p className="stamp px-4 py-8 text-center text-stamp-sm text-mute">
          No events recorded in this range
        </p>
      ) : (
        <ol className="max-h-105 overflow-y-auto px-4 py-3">
          {sorted.map((event) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* the rail: a hairline behind a state dot */}
              <div className="relative flex w-3 shrink-0 justify-center">
                <span className="absolute inset-y-0 w-px bg-line" aria-hidden />
                <span
                  aria-hidden
                  className={`relative mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-plate ${
                    event.severity
                      ? SEVERITY_RAIL[event.severity]
                      : TYPE_RAIL[event.type]
                  }`}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-data text-ink">{event.title}</p>
                  {event.severity ? (
                    <StatusPill status={event.severity} kind="severity" />
                  ) : null}
                </div>
                {event.description ? (
                  <p className="mt-0.5 text-note text-steel">{event.description}</p>
                ) : null}
                <time className="mt-1 block font-mono text-data-xs text-mute">
                  {formatDateTime(event.ts)} UTC
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
