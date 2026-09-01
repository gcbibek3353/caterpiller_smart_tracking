import type { EquipmentSummary } from "@/types/asset";
import { StatusPill } from "@/components/ui/status";
import { formatDateTime } from "@/lib/design-system";

/**
 * Section 1 of the asset page: the identification plate itself. Code and name
 * on the left in display type, the machine's current assignment stamped on the
 * right — exactly the label riveted to the real machine.
 */
export function AssetHeader({ summary }: { summary: EquipmentSummary }) {
  return (
    <section className="rounded-plate border border-line bg-plate shadow-plate">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="stamp text-stamp-xs text-hivis">{summary.type.replace(/_/g, " ")}</p>
          <h1 className="font-display text-title-lg font-bold uppercase text-ink">
            {summary.code}
          </h1>
          <p className="mt-1 text-body text-steel">{summary.name}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill status={summary.status} />
            <span className="stamp rounded-plate border border-line bg-dust px-2 py-1 text-stamp-sm text-steel">
              Engine {summary.currentEngineState}
            </span>
          </div>
        </div>

        <dl className="shrink-0 sm:min-w-56">
          <Row label="Site" value={summary.site?.name} />
          <Row label="Operator" value={summary.operator?.name} />
          <Row label="Booking" value={summary.booking?.code} mono />
          <Row
            label="Return by"
            value={summary.booking ? formatDateTime(summary.booking.endDate) : undefined}
          />
        </dl>
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5 last:border-0">
      <dt className="stamp shrink-0 text-stamp-xs text-mute">{label}</dt>
      <dd
        className={`truncate text-right text-data-sm ${
          value ? "text-ink" : "text-mute"
        } ${mono ? "font-mono" : ""}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
