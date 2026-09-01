"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api, API_URL, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Booking, Equipment } from "@/lib/types";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status";
import { EquipmentPhoto } from "@/components/equipment/EquipmentPhoto";

type BookingDetail = Booking & {
  equipment: Pick<Equipment, "id" | "code" | "name" | "type" | "imageUrl" | "status"> | null;
  site: { id: string; name: string } | null;
  operator: { id: string; name: string; phone: string | null } | null;
  isOverdue?: boolean;
};

/** The statuses for which the server will serve a QR at all. */
const HAS_QR = ["CONFIRMED", "CHECKED_OUT"];

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const stamp = (iso: string | null) =>
  iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) : "—";

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: booking, error, loading, refetch } = useApi<BookingDetail>(`/api/bookings/${id}`);

  return (
    <>
      <Link href="/bookings" className="stamp mb-4 inline-block text-[11px] text-mute hover:text-ink">
        ← All bookings
      </Link>

      {loading ? (
        <p className="stamp text-[11px] text-mute">Loading…</p>
      ) : error ? (
        <Plate title="Could not load booking">
          <p className="text-sm text-alert">{error.message}</p>
        </Plate>
      ) : !booking ? null : (
        <>
          <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="stamp text-[10px] text-hivis">{booking.code}</p>
              <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
                {booking.equipment?.name ?? "Booking"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusPill status={booking.status} kind="booking" />
                {booking.isOverdue ? (
                  <span className="stamp rounded-plate border border-alert/40 bg-alert/12 px-2 py-1 text-[10px] leading-none text-alert">
                    Overdue — due back {day(booking.endDate)}
                  </span>
                ) : null}
              </div>
            </div>
          </header>

          <div className="grid gap-5 lg:grid-cols-[1fr_auto]">
            <div className="grid gap-5">
              <Plate title="Rental">
                {booking.equipment ? (
                  <Link href={`/equipment/${booking.equipment.id}`} className="mb-4 block">
                    <EquipmentPhoto
                      src={booking.equipment.imageUrl}
                      alt={`${booking.equipment.code} — ${booking.equipment.name}`}
                      type={booking.equipment.type}
                      sizes="(max-width: 1024px) 100vw, 640px"
                      className="aspect-[16/9] w-full"
                    />
                  </Link>
                ) : null}
                <PlateRows>
                  <PlateRow label="Machine" value={booking.equipment?.code ?? "—"} />
                  <PlateRow label="Type" value={(booking.equipment?.type ?? "—").replace(/_/g, " ")} />
                  <PlateRow label="Start" value={day(booking.startDate)} />
                  <PlateRow label="Expected return" value={day(booking.endDate)} />
                  <PlateRow label="Checked out" value={stamp(booking.checkoutAt)} />
                  <PlateRow label="Checked in" value={stamp(booking.checkinAt)} />
                  <PlateRow label="Site" value={booking.site?.name ?? "Not assigned"} />
                  <PlateRow label="Operator" value={booking.operator?.name ?? "Not assigned"} />
                </PlateRows>
              </Plate>

              <Plate title="Charges">
                <PlateRows>
                  <PlateRow label="Daily rate" value={`$${booking.dailyRate.toFixed(2)}`} />
                  <PlateRow
                    label="Total"
                    value={
                      booking.totalAmount != null
                        ? `$${booking.totalAmount.toFixed(2)}`
                        : "Calculated at check-in"
                    }
                  />
                </PlateRows>
                {booking.totalAmount == null ? (
                  <p className="mt-3 text-[13px] text-mute">
                    Billed on the time you actually hold the machine, so returning early costs less and
                    returning late costs more.
                  </p>
                ) : null}
              </Plate>

              {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
                <CancelBooking id={booking.id} onCancelled={() => { void refetch(); router.refresh(); }} />
              ) : null}
            </div>

            <QrPanel booking={booking} />
          </div>
        </>
      )}
    </>
  );
}

function QrPanel({ booking }: { booking: BookingDetail }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasQr = HAS_QR.includes(booking.status);

  /**
   * Fetched as a blob rather than set as an <img src>.
   *
   * The QR endpoint is behind the session cookie. A plain cross-origin <img>
   * only carries that cookie while the API and the app are same-site, which is
   * true on localhost (ports don't affect "site") and false once they are on
   * different domains — so the demo would work and the deploy would show a
   * broken image. `credentials: "include"` behaves the same in both.
   */
  useEffect(() => {
    if (!hasQr) return;
    let url: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/bookings/${booking.id}/qr.png`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`QR unavailable (${res.status})`);
        const blob = await res.blob();
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [booking.id, hasQr]);

  if (!hasQr) {
    return (
      <Plate title="QR code" className="lg:w-[360px]">
        <p className="text-sm text-steel">
          {booking.status === "PENDING"
            ? "Your QR is issued once an admin confirms this booking."
            : booking.status === "CANCELLED"
              ? "This booking was cancelled, so its QR is no longer valid."
              : "This rental is complete. The QR has been used and is no longer valid."}
        </p>
      </Plate>
    );
  }

  return (
    <Plate
      title="Scan at pickup"
      meta={booking.status === "CHECKED_OUT" ? "Return" : "Collection"}
      tone="hivis"
      className="lg:w-[360px]"
    >
      {error ? (
        <p className="text-sm text-alert">{error}</p>
      ) : src ? (
        <>
          {/* Deliberately large: this gets scanned off a laptop screen from
              about three feet away, and a small QR is the difference between a
              clean demo and someone walking a phone towards the monitor. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- src is a
              blob: object URL from a credentialed fetch; next/image cannot
              load or optimise one, and there is no remote URL to point it at. */}
          <img
            src={src}
            alt={`QR code for booking ${booking.code}`}
            className="mx-auto block w-full max-w-[320px] rounded-plate bg-plate"
          />
          <p className="mt-3 text-center font-mono text-sm text-ink">{booking.code}</p>
          <p className="mt-1 text-center text-[13px] text-mute">
            {booking.status === "CHECKED_OUT"
              ? "Show this when you return the machine."
              : "Show this to staff at pickup."}
          </p>
        </>
      ) : (
        <div className="grid h-[320px] place-items-center">
          <p className="stamp text-[11px] text-mute">Generating…</p>
        </div>
      )}
    </Plate>
  );
}

function CancelBooking({ id, onCancelled }: { id: string; onCancelled: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/bookings/${id}`, { status: "CANCELLED" });
      onCancelled();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <Plate title="Cancel">
      {error ? <p className="mb-3 text-[13px] text-alert">{error}</p> : null}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-steel">Cancel this booking? This cannot be undone.</p>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Keep it</Button>
          <Button variant="danger" loading={saving} onClick={cancel}>Yes, cancel</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="mr-auto text-sm text-steel">
            You can cancel until the machine is checked out.
          </p>
          <Button variant="secondary" onClick={() => setConfirming(true)}>Cancel booking</Button>
        </div>
      )}
    </Plate>
  );
}
