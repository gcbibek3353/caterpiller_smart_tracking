"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import type { Booking, BookingStatus, Equipment, Paginated } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";

/** Booking rows come back with their relations joined by the API. */
type BookingRow = Booking & {
  equipment: Pick<Equipment, "id" | "code" | "name" | "type"> | null;
  site: { id: string; name: string } | null;
  /** Server-computed — see backend/src/lib/overdue.ts for the grace-day rule. */
  isOverdue: boolean;
};

const FILTERS: { label: string; value: BookingStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Out", value: "CHECKED_OUT" },
  { label: "Returned", value: "RETURNED" },
];

const day = (iso: string) => iso.slice(0, 10);

export default function MyBookingsPage() {
  const [status, setStatus] = useState<BookingStatus | "">("");

  // No clientId here on purpose. The API pins a CLIENT to their own bookings
  // server-side and ignores the filter, so sending one would be theatre.
  const bookings = useApi<Paginated<BookingRow>>("/api/bookings", {
    limit: 50,
    ...(status ? { status } : {}),
  });

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-[10px] text-hivis">Rentals</p>
          <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
            My bookings
          </h1>
        </div>
        <Link
          href="/equipment"
          className="stamp rounded-plate border border-transparent bg-hivis px-4 py-2.5 text-[12px] text-ink hover:bg-hivis-deep hover:text-plate"
        >
          Book a machine
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatus(f.value)}
            className={`stamp rounded-plate border px-3 py-2 text-[11px] transition-colors ${
              status === f.value
                ? "border-ink bg-ink text-dust"
                : "border-line bg-plate text-steel hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {bookings.loading ? (
        <p className="stamp text-[11px] text-mute">Loading…</p>
      ) : bookings.error ? (
        <Plate title="Could not load bookings">
          <p className="text-sm text-alert">{bookings.error.message}</p>
        </Plate>
      ) : !bookings.data?.items.length ? (
        <Plate title="No bookings yet">
          <p className="text-sm text-steel">
            {status
              ? "Nothing with that status. Clear the filter to see everything."
              : "Browse the catalogue and request your first machine — it starts as pending until an admin confirms it."}
          </p>
        </Plate>
      ) : (
        <div className="grid gap-3">
          {bookings.data.items.map((b) => {
            /**
             * Read, not re-derived. `endDate` is midnight UTC of the last
             * rental day and is inclusive, so "late" needs a grace day —
             * `now > endDate` alone badges every active rental at 00:01 on the
             * return morning. That rule lives in backend/src/lib/overdue.ts and
             * arrives on the row, which also keeps this component pure.
             */
            const overdue = b.isOverdue;
            return (
              <Link key={b.id} href={`/bookings/${b.id}`} className="block">
                <article className="rounded-plate border border-line bg-plate p-4 transition-colors hover:border-ink">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-ink">{b.code}</span>
                        <StatusPill status={b.status} kind="booking" />
                        {overdue ? (
                          <span className="stamp rounded-plate border border-alert/40 bg-alert/12 px-2 py-1 text-[10px] leading-none text-alert">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 font-display text-xl font-semibold uppercase leading-none">
                        {b.equipment?.name ?? "Machine"}
                      </p>
                      <p className="mt-1 text-[13px] text-mute">
                        {b.equipment?.code}
                        {b.site ? ` · ${b.site.name}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm">{day(b.startDate)} → {day(b.endDate)}</p>
                      <p className="mt-1 font-mono text-[13px] text-mute">
                        {b.totalAmount != null
                          ? `$${b.totalAmount.toFixed(2)} final`
                          : `$${b.dailyRate.toFixed(2)}/day`}
                      </p>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
