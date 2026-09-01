import Link from "next/link";
import type { EquipmentSummary } from "@/types/asset";
import { StatusPill } from "@/components/ui/status";
import { EquipmentPhoto } from "@/components/equipment/EquipmentPhoto";
import { formatDateTime } from "@/lib/design-system";

/**
 * Section 1 of the detail page: the identification plate itself. Photograph,
 * then code and name in display type, with the machine's current assignment
 * stamped on the right — exactly the plate riveted to the real machine.
 */
export function AssetHeader({ summary }: { summary: EquipmentSummary }) {
  const spec = [summary.make, summary.model, summary.year].filter(Boolean).join(" ");

  return (
    <section className="overflow-hidden rounded-plate border border-line bg-plate shadow-plate">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start">
        {/* Fixed aspect so a portrait photo cannot stretch the header. */}
        <EquipmentPhoto
          src={summary.imageUrl}
          alt={`${summary.code} — ${summary.name}`}
          type={summary.type}
          priority
          sizes="(max-width: 1024px) 100vw, 320px"
          className="aspect-[4/3] w-full shrink-0 lg:w-80"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="stamp text-stamp-xs text-hivis">{summary.type.replace(/_/g, " ")}</p>
            <h1 className="font-display text-title-lg font-bold uppercase text-ink">
              {summary.code}
            </h1>
            <p className="mt-1 text-body text-steel">{summary.name}</p>
            {spec ? <p className="mt-0.5 font-mono text-data-sm text-mute">{spec}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={summary.status} />
              <span className="stamp rounded-plate border border-line bg-dust px-2 py-1 text-stamp-sm text-steel">
                Engine {summary.currentEngineState}
              </span>
              <span className="stamp rounded-plate border border-line bg-dust px-2 py-1 text-stamp-sm text-steel">
                ${summary.dailyRate.toFixed(2)} / day
              </span>
            </div>
          </div>

          <dl className="shrink-0 sm:min-w-56">
            <Row label="Site" value={summary.site?.name} />
            <Row label="Operator" value={summary.operator?.name} />
            <Row
              label="Booking"
              value={summary.booking?.code}
              mono
              href={summary.booking ? `/bookings/${summary.booking.id}` : undefined}
            />
            <Row
              label="Return by"
              value={summary.booking ? formatDateTime(summary.booking.endDate) : undefined}
            />
            <Row label="Meter" value={`${summary.meterHours.toFixed(1)} h`} mono />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  href?: string;
}) {
  const body = (
    <span className={`truncate ${value ? "text-ink" : "text-mute"} ${mono ? "font-mono" : ""}`}>
      {value ?? "—"}
    </span>
  );
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-1.5 last:border-0">
      <dt className="stamp shrink-0 text-stamp-xs text-mute">{label}</dt>
      <dd className="min-w-0 text-right text-data-sm">
        {href && value ? (
          <Link href={href} className="underline-offset-4 hover:text-hivis hover:underline">
            {body}
          </Link>
        ) : (
          body
        )}
      </dd>
    </div>
  );
}
