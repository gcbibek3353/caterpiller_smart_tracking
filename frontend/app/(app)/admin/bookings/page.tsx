"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type {
  BookingStatus,
  BookingWithRelations,
  ConfirmedBooking,
  Operator,
  Paginated,
  Site,
} from "@/lib/types";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/status";

const FILTERS: { label: string; value: BookingStatus | "" }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Out", value: "CHECKED_OUT" },
  { label: "Returned", value: "RETURNED" },
  { label: "Cancelled", value: "CANCELLED" },
];

/** PATCH refuses any edit to a finished booking, so the controls disappear too. */
const EDITABLE: BookingStatus[] = ["PENDING", "CONFIRMED", "CHECKED_OUT"];
const CANCELLABLE: BookingStatus[] = ["PENDING", "CONFIRMED"];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const PAGE_SIZE = 50;

export default function AdminBookingsPage() {
  const [status, setStatus] = useState<BookingStatus | "">("");
  const [overdue, setOverdue] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [find, setFind] = useState("");
  const [page, setPage] = useState(1);

  const [assigning, setAssigning] = useState<BookingWithRelations | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const [cancelling, setCancelling] = useState<BookingWithRelations | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const bookings = useApi<Paginated<BookingWithRelations>>("/api/bookings", {
    page,
    limit: PAGE_SIZE,
    // `overdue` pins status to CHECKED_OUT server-side, so sending both would
    // only ever narrow to nothing when the chip disagrees.
    ...(overdue ? { overdue: "true" } : status ? { status } : {}),
    ...(from ? { from: `${from}T00:00:00.000Z` } : {}),
    ...(to ? { to: `${to}T00:00:00.000Z` } : {}),
  });

  /**
   * Text search is local to the page of rows already loaded.
   *
   * There is no `q` on GET /api/bookings and no endpoint that lists clients, so
   * a server-side client filter has nothing to populate itself from. Narrowing
   * fifty visible rows by code or company is the honest version of that, and it
   * says so under the box rather than pretending to search everything.
   */
  const rows = useMemo(() => {
    const items = bookings.data?.items ?? [];
    const needle = find.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((b) =>
      [b.code, b.equipment?.code, b.equipment?.name, b.client?.name, b.client?.companyName, b.site?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [bookings.data, find]);

  const pages = bookings.data?.pages ?? 1;

  async function confirm(b: BookingWithRelations) {
    setBusyId(b.id);
    setRowError(null);
    try {
      const result = await api.post<ConfirmedBooking>(`/api/bookings/${b.id}/confirm`);
      setConfirmed(result);
      await bookings.refetch();
    } catch (e) {
      setRowError({ id: b.id, message: e instanceof ApiError ? e.message : "Could not confirm" });
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(b: BookingWithRelations) {
    setBusyId(b.id);
    setRowError(null);
    try {
      await api.patch(`/api/bookings/${b.id}`, { status: "CANCELLED" });
      setCancelling(null);
      await bookings.refetch();
    } catch (e) {
      setCancelling(null);
      setRowError({ id: b.id, message: e instanceof ApiError ? e.message : "Could not cancel" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-stamp-sm text-hivis">Rental desk</p>
          <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
            Bookings
          </h1>
          <p className="mt-2 text-note text-mute">
            {bookings.data ? `${bookings.data.total} matching` : "…"}
            {find ? ` · showing ${rows.length} on this page` : ""}
          </p>
        </div>
        <Link
          href="/admin/scanner"
          className="stamp rounded-plate border border-transparent bg-hivis px-4 py-2.5 text-stamp-lg text-ink hover:bg-hivis-deep hover:text-plate"
        >
          Open scanner
        </Link>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => {
              setStatus(f.value);
              setOverdue(false);
              setPage(1);
            }}
            className={`stamp rounded-plate border px-3 py-2 text-stamp transition-colors ${
              !overdue && status === f.value
                ? "border-ink bg-ink text-dust"
                : "border-line bg-plate text-steel hover:border-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => {
            setOverdue((v) => !v);
            setPage(1);
          }}
          className={`stamp rounded-plate border px-3 py-2 text-stamp transition-colors ${
            overdue
              ? "border-alert bg-alert text-plate"
              : "border-alert/40 bg-alert/8 text-alert hover:border-alert"
          }`}
        >
          Overdue only
        </button>
      </div>

      <Plate title="Filter" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Find on this page"
            name="find"
            placeholder="BK-0042, EXC-0007, Acme…"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            hint="Narrows the rows already loaded"
          />
          <Field
            label="Window from"
            name="from"
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); setPage(1); }}
          />
          <Field
            label="Window to"
            name="to"
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); setPage(1); }}
            hint="Bookings that intersect the window"
          />
        </div>
      </Plate>

      {bookings.error ? (
        <p className="border-l-2 border-alert bg-alert/6 px-4 py-3 text-body text-alert">
          {bookings.error.message}
        </p>
      ) : bookings.loading ? (
        <p className="stamp text-stamp text-mute">Reading the book…</p>
      ) : rows.length === 0 ? (
        <Plate title="Bookings" meta="0 matching">
          <p className="text-body text-steel">
            {find
              ? "Nothing on this page matches that text. Clear it, or turn the page."
              : "Nothing matches these filters."}
          </p>
        </Plate>
      ) : (
        <>
          <div className="overflow-x-auto rounded-plate border border-line bg-plate">
            <table className="w-full text-left text-body">
              <thead>
                <tr className="stamp border-b border-line text-stamp-sm text-mute">
                  <th className="px-4 py-3">Booking</th>
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">Dispatch</th>
                  <th className="px-4 py-3 text-right">Charge</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="font-mono text-data text-ink underline-offset-4 hover:text-hivis hover:underline"
                      >
                        {b.code}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusPill status={b.status} kind="booking" />
                        {b.isOverdue ? (
                          <span className="stamp rounded-plate border border-alert/40 bg-alert/12 px-2 py-1 text-stamp-sm leading-none text-alert">
                            Overdue
                          </span>
                        ) : null}
                      </div>
                      {rowError?.id === b.id ? (
                        <p className="mt-1.5 max-w-[22ch] text-note text-alert">{rowError.message}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-display text-title-sm font-semibold uppercase leading-none">
                        {b.equipment?.name ?? "—"}
                      </p>
                      <p className="mt-1 font-mono text-data-sm text-mute">{b.equipment?.code ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-body text-ink">{b.client?.companyName ?? b.client?.name ?? "—"}</p>
                      {b.client?.companyName ? (
                        <p className="mt-1 text-note text-mute">{b.client.name}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-data-sm">
                      {day(b.startDate)} → {day(b.endDate)}
                    </td>
                    <td className="px-4 py-3 text-note">
                      <p className={b.site ? "text-ink" : "text-mute"}>{b.site?.name ?? "No site"}</p>
                      <p className={b.operator ? "text-ink" : "text-mute"}>
                        {b.operator?.name ?? "No operator"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-data">
                      {b.totalAmount != null ? (
                        <>${b.totalAmount.toFixed(2)}</>
                      ) : (
                        <span className="text-mute">${b.dailyRate.toFixed(2)}/d</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {b.status === "PENDING" ? (
                          <Button
                            className="px-2 py-1 text-stamp-sm"
                            loading={busyId === b.id}
                            onClick={() => confirm(b)}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        {EDITABLE.includes(b.status) ? (
                          <Button
                            variant="secondary"
                            className="px-2 py-1 text-stamp-sm"
                            onClick={() => { setRowError(null); setAssigning(b); }}
                          >
                            Assign
                          </Button>
                        ) : null}
                        {CANCELLABLE.includes(b.status) ? (
                          <Button
                            variant="ghost"
                            className="px-2 py-1 text-stamp-sm"
                            onClick={() => { setRowError(null); setCancelling(b); }}
                          >
                            Cancel
                          </Button>
                        ) : null}
                        {!EDITABLE.includes(b.status) ? (
                          <span className="stamp text-stamp-sm text-mute/60">Closed</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="stamp text-stamp-sm text-mute">Page {page} of {pages}</span>
              <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}

      {assigning ? (
        <DispatchDialog
          booking={assigning}
          onClose={() => setAssigning(null)}
          onSaved={async () => {
            setAssigning(null);
            await bookings.refetch();
          }}
        />
      ) : null}

      {cancelling ? (
        <Dialog title={`Cancel ${cancelling.code}`} onClose={() => setCancelling(null)}>
          <p className="text-body text-steel">
            Cancel this booking for {cancelling.client?.companyName ?? cancelling.client?.name}? The
            machine goes back on the catalogue and the QR stops working. This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCancelling(null)}>Keep it</Button>
            <Button variant="danger" loading={busyId === cancelling.id} onClick={() => cancel(cancelling)}>
              Yes, cancel
            </Button>
          </div>
        </Dialog>
      ) : null}

      {confirmed ? <ConfirmedDialog booking={confirmed} onClose={() => setConfirmed(null)} /> : null}
    </>
  );
}

// ── Confirm result: the QR comes back inline ─────────────────────────

function ConfirmedDialog({ booking, onClose }: { booking: ConfirmedBooking; onClose: () => void }) {
  return (
    <Dialog title={`${booking.code} confirmed`} meta="QR issued" tone="hivis" onClose={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from
          the confirm response; next/image can neither load nor optimise one. */}
      <img
        src={booking.qrDataUrl}
        alt={`QR code for booking ${booking.code}`}
        className="mx-auto block w-full max-w-[280px] rounded-plate bg-plate"
      />
      <p className="mt-3 text-center font-mono text-data">{booking.equipment?.code}</p>
      <p
        className={`mt-3 rounded-plate border p-3 text-note ${
          booking.emailed
            ? "border-ok/35 bg-ok/8 text-ok"
            : "border-warn/40 bg-warn/10 text-warn"
        }`}
      >
        {booking.emailed
          ? `Emailed to ${booking.client?.email ?? "the client"} with the QR attached.`
          : `Confirmed, but the receipt did not send${booking.emailError ? `: ${booking.emailError}` : ""}. The client can still open their booking to get the QR.`}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Link
          href={`/bookings/${booking.id}`}
          className="stamp rounded-plate border border-line bg-plate px-4 py-2.5 text-stamp-lg text-ink hover:border-ink"
        >
          Open booking
        </Link>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Dialog>
  );
}

// ── Dispatch: site, operator, and the return date ────────────────────

function DispatchDialog({
  booking,
  onClose,
  onSaved,
}: {
  booking: BookingWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const clientId = booking.client?.id;

  /**
   * Scoped to this booking's client, not the whole yard. The backend now
   * refuses a site or operator belonging to anyone else, so an unscoped list
   * would just be a menu of guaranteed 400s.
   */
  const sites = useApi<Paginated<Site>>(clientId ? "/api/sites" : null, { clientId, limit: 200 });
  const operators = useApi<Paginated<Operator>>(clientId ? "/api/operators" : null, {
    clientId,
    limit: 200,
  });

  const [siteId, setSiteId] = useState(booking.site?.id ?? "");
  const [operatorId, setOperatorId] = useState(booking.operator?.id ?? "");
  const [endDate, setEndDate] = useState(booking.endDate.slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<{ code: string; startDate: string; endDate: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const originalEnd = booking.endDate.slice(0, 10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setClash(null);

    // Only send what moved: PATCH rejects an empty body, and re-sending an
    // unchanged endDate would re-run the overlap check for nothing.
    const payload: Record<string, string | null> = {};
    if (siteId !== (booking.site?.id ?? "")) payload.siteId = siteId || null;
    if (operatorId !== (booking.operator?.id ?? "")) payload.operatorId = operatorId || null;
    if (endDate !== originalEnd) payload.endDate = `${endDate}T00:00:00.000Z`;

    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    try {
      await api.patch(`/api/bookings/${booking.id}`, payload);
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        const c = (err.details as { conflictingBooking?: { code: string; startDate: string; endDate: string } })
          ?.conflictingBooking;
        if (c) setClash(c);
      } else {
        setError(String(err));
      }
      setSaving(false);
    }
  }

  return (
    <Dialog
      title={`Dispatch ${booking.code}`}
      meta={booking.equipment?.code}
      onClose={onClose}
      width="max-w-lg"
    >
      <form onSubmit={submit} className="grid gap-4">
        <PlateRows>
          <PlateRow label="Client" value={booking.client?.companyName ?? booking.client?.name ?? "—"} mono={false} />
          <PlateRow label="Machine" value={`${booking.equipment?.code} · ${booking.equipment?.name}`} />
          <PlateRow label="Booked" value={`${day(booking.startDate)} → ${originalEnd}`} />
        </PlateRows>

        <Select
          label="Site"
          name="siteId"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          hint={
            sites.loading
              ? "Loading this client's sites…"
              : sites.data?.items.length
                ? "Only this client's sites — the geofence detector measures against it"
                : "This client has no sites on file yet"
          }
        >
          <option value="">Not assigned</option>
          {(sites.data?.items ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>

        <Select
          label="Operator"
          name="operatorId"
          value={operatorId}
          onChange={(e) => setOperatorId(e.target.value)}
          hint={
            operators.loading
              ? "Loading this client's operators…"
              : operators.data?.items.length
                ? "Leaving this empty is what fires the MISSING_OPERATOR anomaly"
                : "This client has no operators on file yet"
          }
        >
          <option value="">Not assigned</option>
          {(operators.data?.items ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}{o.licenseNo ? ` · ${o.licenseNo}` : ""}
            </option>
          ))}
        </Select>

        <Field
          label="Return by"
          name="endDate"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          hint="Inclusive — the machine is due back at the end of this day"
        />

        {error ? (
          <div className="rounded-plate border border-alert/40 bg-alert/8 p-3">
            <p className="text-note text-alert">{error}</p>
            {clash ? (
              <p className="mt-1 font-mono text-data-sm text-steel">
                {clash.code}: {clash.startDate.slice(0, 10)} → {clash.endDate.slice(0, 10)}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Close</Button>
          <Button type="submit" loading={saving}>Save dispatch</Button>
        </div>
      </form>
    </Dialog>
  );
}
