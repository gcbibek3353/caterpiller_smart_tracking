"use client";

import { useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/use-api";
import type { Booking, BookingStatus, Equipment, Paginated } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { StatusPill } from "@/components/ui/status";
import { EquipmentPhoto } from "@/components/equipment/EquipmentPhoto";

/** Booking rows come back with their relations joined by the API. */
type BookingRow = Booking & {
  equipment: Pick<Equipment, "id" | "code" | "name" | "type" | "imageUrl"> | null;
  site: { id: string; name: string } | null;
  /** Server-computed — see backend/src/lib/overdue.ts for the grace-day rule. */
  isOverdue: boolean;
  /** Whole days until the return date; null unless the machine is out. */
  daysUntilReturn: number | null;
};

/** How far ahead the returns tab looks. */
const RETURN_HORIZON_DAYS = 7;

type Tab = { label: string; value: string };

const FILTERS: Tab[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Out", value: "CHECKED_OUT" },
  { label: "Returned", value: "RETURNED" },
];

/** Not a status, so it cannot live in FILTERS — it is a date window. */
const RETURNS = "returns";

const day = (iso: string) => iso.slice(0, 10);

/** Reads off the server-sent day count, so nothing here touches the clock. */
function dueLabel(days: number | null): string {
  if (days == null) return "";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState<BookingStatus | "" | typeof RETURNS>("");
  const showingReturns = tab === RETURNS;

  // No clientId here on purpose. The API pins a CLIENT to their own bookings
  // server-side and ignores the filter, so sending one would be theatre.
  const bookings = useApi<Paginated<BookingRow>>("/api/bookings", {
    limit: 50,
    ...(showingReturns
      ? { returningWithinDays: RETURN_HORIZON_DAYS }
      : tab
        ? { status: tab }
        : {}),
  });

  /**
   * A second, deliberately tiny request purely for the tab's count — `limit=1`
   * still reports the full `total`. Worth one round trip: "Upcoming returns"
   * with nothing beside it makes you click to find out there is nothing there.
   */
  const returnsCount = useApi<Paginated<BookingRow>>("/api/bookings", {
    limit: 1,
    returningWithinDays: RETURN_HORIZON_DAYS,
  });
  const dueSoon = returnsCount.data?.total ?? 0;

  const items = bookings.data?.items ?? [];

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

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setTab(f.value as BookingStatus | "")}
            className={`stamp rounded-plate border px-3 py-2 text-[11px] transition-colors ${
              tab === f.value
                ? "border-ink bg-ink text-dust"
                : "border-line bg-plate text-steel hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}

        {/* Separated from the status chips because it is a different question:
            not "what state is this in" but "what do I have to hand back". */}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <button
          onClick={() => setTab(RETURNS)}
          aria-pressed={showingReturns}
          className={`stamp inline-flex items-center gap-2 rounded-plate border px-3 py-2 text-[11px] transition-colors ${
            showingReturns
              ? "border-ink bg-ink text-dust"
              : "border-line bg-plate text-steel hover:border-ink"
          }`}
        >
          Upcoming returns
          {dueSoon > 0 ? (
            <span
              className={`rounded-plate px-1.5 py-0.5 text-[10px] leading-none ${
                showingReturns ? "bg-hivis text-ink" : "bg-hivis/15 text-hivis-deep"
              }`}
            >
              {dueSoon}
            </span>
          ) : null}
        </button>
      </div>

      {showingReturns ? (
        <p className="mb-4 text-[13px] text-mute">
          Machines you have out that are due back in the next {RETURN_HORIZON_DAYS} days, soonest
          first. Anything already past its return date appears under{" "}
          <button onClick={() => setTab("CHECKED_OUT")} className="text-hivis underline underline-offset-4">
            Out
          </button>{" "}
          with an overdue badge instead.
        </p>
      ) : null}

      {bookings.loading ? (
        <p className="stamp text-[11px] text-mute">Loading…</p>
      ) : bookings.error ? (
        <Plate title="Could not load bookings">
          <p className="text-sm text-alert">{bookings.error.message}</p>
        </Plate>
      ) : items.length === 0 ? (
        <Plate title={showingReturns ? "Nothing due back" : "No bookings yet"}>
          <p className="text-sm text-steel">
            {showingReturns
              ? `No machine of yours is due back in the next ${RETURN_HORIZON_DAYS} days.`
              : tab
                ? "Nothing with that status. Clear the filter to see everything."
                : "Browse the catalogue and request your first machine — it starts as pending until an admin confirms it."}
          </p>
        </Plate>
      ) : (
        <div className="grid gap-3">
          {items.map((b) => {
            /**
             * Read, not re-derived. `endDate` is midnight UTC of the last
             * rental day and is inclusive, so "late" needs a grace day —
             * `now > endDate` alone badges every active rental at 00:01 on the
             * return morning. That rule lives in backend/src/lib/overdue.ts and
             * arrives on the row, which also keeps this component pure.
             */
            const overdue = b.isOverdue;
            const due = dueLabel(b.daysUntilReturn);
            // Due today or tomorrow is the thing worth acting on.
            const urgent = b.daysUntilReturn != null && b.daysUntilReturn <= 1;

            return (
              <Link key={b.id} href={`/bookings/${b.id}`} className="block">
                <article className="rounded-plate border border-line bg-plate p-4 transition-colors hover:border-ink">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-3">
                      <EquipmentPhoto
                        src={b.equipment?.imageUrl}
                        alt={b.equipment?.name ?? "Machine"}
                        type={b.equipment?.type}
                        sizes="88px"
                        className="hidden h-16 w-[88px] shrink-0 sm:block"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm text-ink">{b.code}</span>
                          <StatusPill status={b.status} kind="booking" />
                          {overdue ? (
                            <span className="stamp rounded-plate border border-alert/40 bg-alert/12 px-2 py-1 text-[10px] leading-none text-alert">
                              Overdue
                            </span>
                          ) : showingReturns && due ? (
                            <span
                              className={`stamp rounded-plate border px-2 py-1 text-[10px] leading-none ${
                                urgent
                                  ? "border-warn/40 bg-warn/15 text-warn"
                                  : "border-line bg-dust text-steel"
                              }`}
                            >
                              {due}
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
