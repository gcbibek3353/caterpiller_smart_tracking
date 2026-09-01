"use client";

import { EQUIPMENT_STATUS_COLOR } from "@/lib/design-system";

export interface StatusSlice {
  status: string;
  count: number;
}

/**
 * Fleet status mix as a horizontal part-to-whole bar rather than a donut.
 *
 * Two reasons. The category names are long ("CHECKED OUT", "MAINTENANCE"), and
 * horizontal bars give them room a donut's radial labels never do. And a donut
 * asks the reader to compare five arcs by colour alone — the counts here are
 * printed next to every segment instead, so the colour is a locator, not the
 * only channel carrying the number.
 */
export function StatusBar({ data, title = "Fleet status" }: { data: StatusSlice[]; title?: string }) {
  const slices = data.filter((s) => s.count > 0);
  const total = slices.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return (
      <section className="rounded-plate border border-line bg-plate shadow-plate">
        <header className="border-b border-line/60 px-4 py-2.5">
          <h3 className="stamp text-stamp text-steel">{title}</h3>
        </header>
        <p className="stamp px-4 py-6 text-center text-stamp-sm text-mute">No machines on record</p>
      </section>
    );
  }

  return (
    <section className="rounded-plate border border-line bg-plate shadow-plate">
      <header className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-2.5">
        <h3 className="stamp text-stamp text-steel">{title}</h3>
        <span className="font-mono text-data-xs text-mute">{total} total</span>
      </header>

      <div className="p-4">
        {/* the bar — 2px surface gaps keep adjacent segments legible */}
        <div
          className="flex h-7 w-full gap-0.5 overflow-hidden rounded-plate"
          role="img"
          aria-label={slices.map((s) => `${s.status.replace(/_/g, " ")}: ${s.count}`).join(", ")}
        >
          {slices.map((s) => (
            <div
              key={s.status}
              className="h-full first:rounded-l-plate last:rounded-r-plate"
              style={{
                width: `${(s.count / total) * 100}%`,
                backgroundColor: EQUIPMENT_STATUS_COLOR[s.status] ?? EQUIPMENT_STATUS_COLOR.RETIRED,
              }}
              title={`${s.status.replace(/_/g, " ")}: ${s.count}`}
            />
          ))}
        </div>

        {/* every segment direct-labelled with its count and share */}
        <dl className="mt-4 space-y-0">
          {slices.map((s) => (
            <div
              key={s.status}
              className="flex items-center gap-2 border-b border-line/60 py-2 last:border-0"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-plate"
                style={{
                  backgroundColor:
                    EQUIPMENT_STATUS_COLOR[s.status] ?? EQUIPMENT_STATUS_COLOR.RETIRED,
                }}
              />
              <dt className="stamp text-stamp-sm text-mute">{s.status.replace(/_/g, " ")}</dt>
              <dd className="ml-auto flex items-baseline gap-2">
                <span className="font-mono text-data text-ink">{s.count}</span>
                <span className="font-mono text-data-xs text-mute">
                  {Math.round((s.count / total) * 100)}%
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
