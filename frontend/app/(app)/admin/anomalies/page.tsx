"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import { api, ApiError } from "@/lib/api";
import type { Anomaly, AnomalyStatus, Paginated, Severity } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS: (AnomalyStatus | "")[] = ["", "OPEN", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"];
const SEVERITY_OPTIONS: (Severity | "")[] = ["", "HIGH", "MEDIUM", "LOW"];

const selectClass =
  "rounded-plate border border-line bg-plate px-3 py-2 font-mono text-stamp-lg text-ink focus:border-ink";

const SEVERITY_ROW_TINT: Record<Severity, string> = {
  HIGH: "border-l-alert bg-alert/[0.04]",
  MEDIUM: "border-l-warn bg-warn/[0.04]",
  LOW: "border-l-mute bg-transparent",
};

function KpiCard({ label, value, tone }: { label: string; value: number; tone: "alert" | "warn" | "mute" }) {
  const toneClass = { alert: "text-alert", warn: "text-warn", mute: "text-mute" }[tone];
  return (
    <div className="rounded-plate border border-line bg-plate p-4">
      <p className="stamp text-stamp-sm text-mute">{label}</p>
      <p className={`mt-1.5 text-data-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

/** D8 — severity-sorted anomaly table with filters, real equipment identity, and the ack/resolve/false-positive actions. */
export default function AdminAnomalies() {
  const [status, setStatus] = useState<AnomalyStatus | "">("OPEN");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Unfiltered open-severity counts for the summary strip — independent of
  // whatever the table's own filters are currently set to.
  const summary = useApi<Paginated<Anomaly>>("/api/anomalies", { status: "OPEN", limit: 200 });
  const openBySeverity = useMemo(() => {
    const counts: Record<Severity, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const a of summary.data?.items ?? []) counts[a.severity]++;
    return counts;
  }, [summary.data]);

  const { data, error, loading, refetch } = useApi<Paginated<Anomaly>>("/api/anomalies", {
    status: status || undefined,
    severity: severity || undefined,
    limit: 100,
  });

  const act = async (id: string, next: "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE") => {
    setBusyId(id);
    setActionError(null);
    try {
      await api.patch(`/api/anomalies/${id}`, { status: next });
      await Promise.all([refetch(), summary.refetch()]);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Could not update this anomaly");
    } finally {
      setBusyId(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-stamp-sm text-hivis">Fleet ops</p>
          <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
            Anomalies
          </h1>
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AnomalyStatus | "")}
            className={selectClass}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All statuses" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity | "")}
            className={selectClass}
            aria-label="Filter by severity"
          >
            {SEVERITY_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All severities" : s}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <KpiCard label="Open · High" value={openBySeverity.HIGH} tone="alert" />
        <KpiCard label="Open · Medium" value={openBySeverity.MEDIUM} tone="warn" />
        <KpiCard label="Open · Low" value={openBySeverity.LOW} tone="mute" />
      </div>

      {actionError ? (
        <p className="mb-4 border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">{actionError}</p>
      ) : null}

      {error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">{error.message}</p>
      ) : loading ? (
        <p className="stamp text-stamp text-mute">Scanning the fleet…</p>
      ) : items.length === 0 ? (
        <Plate title="Anomalies" meta="0 matching">
          <p className="text-sm text-steel">Nothing matches this filter. Widen it, or that&apos;s genuinely good news.</p>
        </Plate>
      ) : (
        <div className="overflow-x-auto rounded-plate border border-line bg-plate">
          <table className="w-full text-left text-body">
            <thead>
              <tr className="stamp border-b border-line text-stamp-sm text-mute">
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Equipment</th>
                <th className="px-4 py-3">Detected</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className={`border-b border-l-2 border-line/60 last:border-b-0 ${SEVERITY_ROW_TINT[a.severity]}`}>
                  <td className="px-4 py-3">
                    <StatusPill status={a.severity} kind="severity" />
                  </td>
                  <td className="px-4 py-3 font-mono text-stamp-lg">{a.type.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <Link href={`/asset/${a.equipmentId}`} className="group flex flex-col leading-tight hover:text-hivis">
                      <span className="font-mono text-stamp-lg text-ink group-hover:text-hivis">{a.equipmentCode}</span>
                      <span className="stamp text-stamp-xs text-mute">{a.equipmentType.replace(/_/g, " ")}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-stamp-lg text-mute">
                    {new Date(a.detectedAt).toLocaleString()}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-note text-steel">{a.message}</td>
                  <td className="px-4 py-3">
                    <span className="stamp text-stamp-sm text-mute">{a.status.replace(/_/g, " ")}</span>
                  </td>
                  <td className="px-4 py-3">
                    {a.status === "OPEN" ? (
                      <div className="flex gap-1.5">
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-stamp-sm"
                          loading={busyId === a.id}
                          onClick={() => act(a.id, "ACKNOWLEDGED")}
                        >
                          Ack
                        </Button>
                        <Button
                          variant="primary"
                          className="px-2 py-1 text-stamp-sm"
                          loading={busyId === a.id}
                          onClick={() => act(a.id, "RESOLVED")}
                        >
                          Resolve
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2 py-1 text-stamp-sm"
                          loading={busyId === a.id}
                          onClick={() => act(a.id, "FALSE_POSITIVE")}
                        >
                          False+
                        </Button>
                      </div>
                    ) : (
                      <span className="stamp text-stamp-sm text-mute/60">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
