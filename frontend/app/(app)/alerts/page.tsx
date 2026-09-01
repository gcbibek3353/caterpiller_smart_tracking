"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/use-api";
import type { Anomaly, Notification, Paginated } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";

type FeedItem =
  | { kind: "anomaly"; ts: string; row: Anomaly }
  | { kind: "notification"; ts: string; row: Notification };

const NOTIFICATION_TONE: Record<Notification["status"], string> = {
  SENT: "border-ok/40 bg-ok/12 text-ok",
  PENDING: "border-warn/40 bg-warn/15 text-warn",
  FAILED: "border-alert/40 bg-alert/12 text-alert",
};

/**
 * D10 — "what you show on stage instead of opening a real mail client."
 * Merges the anomaly feed and the notification feed into one chronological
 * timeline: an anomaly firing and the email it triggered read as one story
 * here instead of two disconnected tables.
 */
export default function AlertsPage() {
  const anomalies = useApi<Paginated<Anomaly>>("/api/anomalies", { limit: 50 });
  const notifications = useApi<Paginated<Notification>>("/api/notifications", { limit: 50 });

  const feed = useMemo<FeedItem[]>(() => {
    const a: FeedItem[] = (anomalies.data?.items ?? []).map((row) => ({ kind: "anomaly", ts: row.detectedAt, row }));
    const n: FeedItem[] = (notifications.data?.items ?? []).map((row) => ({ kind: "notification", ts: row.createdAt, row }));
    return [...a, ...n].sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime());
  }, [anomalies.data, notifications.data]);

  const loading = anomalies.loading || notifications.loading;
  const error = anomalies.error ?? notifications.error;

  return (
    <>
      <header className="mb-7">
        <p className="stamp text-stamp-sm text-hivis">Live feed</p>
        <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">Alerts</h1>
      </header>

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">{error.message}</p>
      ) : loading ? (
        <p className="stamp text-stamp text-mute">Reading the feed…</p>
      ) : feed.length === 0 ? (
        <Plate title="Alerts" meta="0">
          <p className="text-body text-steel">Nothing yet — anomalies and notifications will land here as they fire.</p>
        </Plate>
      ) : (
        <ol className="flex flex-col gap-3">
          {feed.map((item) => (
            <li key={`${item.kind}-${item.row.id}`}>
              {item.kind === "anomaly" ? (
                <div className="flex items-start gap-4 rounded-plate border border-line bg-plate px-4 py-3">
                  <StatusPill status={item.row.severity} kind="severity" />
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink">{item.row.message}</p>
                    <p className="stamp mt-1 text-stamp-xs text-mute">
                      {item.row.type.replace(/_/g, " ")} · {new Date(item.ts).toLocaleString()} ·{" "}
                      {item.row.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4 rounded-plate border border-line bg-plate px-4 py-3">
                  <span className={`stamp inline-flex items-center rounded-plate border px-2 py-1 text-stamp-sm leading-none ${NOTIFICATION_TONE[item.row.status]}`}>
                    {item.row.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-ink">{item.row.subject}</p>
                    <p className="stamp mt-1 text-stamp-xs text-mute">
                      {item.row.type.replace(/_/g, " ")} · {item.row.channel} · {new Date(item.ts).toLocaleString()}
                    </p>
                    {item.row.error ? <p className="mt-1 text-stamp-lg text-alert">{item.row.error}</p> : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
