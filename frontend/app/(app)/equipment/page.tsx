"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Booking, Equipment, EquipmentType, Paginated } from "@/lib/types";
import { Plate } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status";

const TYPES: EquipmentType[] = [
  "EXCAVATOR", "CRANE", "BULLDOZER", "GRADER",
  "LOADER", "BACKHOE", "DUMP_TRUCK", "COMPACTOR", "FORKLIFT",
];

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export default function BrowseEquipmentPage() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [type, setType] = useState<EquipmentType | "">("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(plusDays(today(), 7));

  /**
   * `availableFrom`/`availableTo` are sent together or not at all — the backend
   * only applies the overlap filter when it has both. With them, the list is
   * exactly what can be booked for this window, so the form below cannot offer
   * a machine that POST /api/bookings would then refuse with a 409.
   */
  const datesValid = Boolean(from && to && from <= to);
  const fleet = useApi<Paginated<Equipment>>("/api/equipment", {
    limit: 60,
    ...(q ? { q } : {}),
    ...(type ? { type } : {}),
    ...(datesValid ? { availableFrom: from, availableTo: to } : {}),
  });

  const [booking, setBooking] = useState<Equipment | null>(null);

  return (
    <>
      <header className="mb-7">
        <p className="stamp text-[10px] text-hivis">Catalogue</p>
        <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-tight">
          Browse equipment
        </h1>
      </header>

      <Plate title="Filter" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Search"
            name="q"
            placeholder="EXC-0007, excavator…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div>
            <label htmlFor="type" className="stamp mb-1.5 block text-[10px] text-steel">
              Type
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as EquipmentType | "")}
              className="w-full rounded-plate border border-line bg-plate px-3 py-2.5 font-mono text-sm text-ink focus:border-ink"
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <Field
            label="Available from"
            name="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Field
            label="Available to"
            name="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={from && to && from > to ? "Must be on or after the start date" : undefined}
          />
        </div>
        <p className="mt-3 text-[13px] text-mute">
          {datesValid
            ? "Showing only machines free for the whole window — dates are inclusive, so a machine returning on your start date still counts as busy."
            : "Pick both dates to hide machines that are already booked."}
        </p>
      </Plate>

      {fleet.loading ? (
        <p className="stamp text-[11px] text-mute">Loading…</p>
      ) : fleet.error ? (
        <Plate title="Could not load equipment">
          <p className="text-sm text-alert">{fleet.error.message}</p>
        </Plate>
      ) : !fleet.data?.items.length ? (
        <Plate title="Nothing available">
          <p className="text-sm text-steel">
            No machine matches these filters. Try a shorter window, a different type, or clear the search.
          </p>
        </Plate>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fleet.data.items.map((e) => (
            <Plate
              key={e.id}
              title={e.code}
              meta={<StatusPill status={e.status} />}
              className="flex flex-col"
            >
              <div className="flex flex-1 flex-col gap-3">
                <div>
                  <p className="font-display text-2xl font-semibold uppercase leading-none">{e.name}</p>
                  <p className="mt-1 text-[13px] text-mute">
                    {e.type.replace(/_/g, " ")}
                    {e.make ? ` · ${e.make}` : ""}
                    {e.model ? ` ${e.model}` : ""}
                    {e.year ? ` · ${e.year}` : ""}
                  </p>
                </div>
                <p className="font-mono text-lg text-ink">
                  ${e.dailyRate.toFixed(2)}
                  <span className="text-[13px] text-mute"> / day</span>
                </p>
                <div className="mt-auto flex gap-2 pt-1">
                  <Button onClick={() => setBooking(e)} className="flex-1">Book</Button>
                  <Link
                    href={`/asset/${e.id}`}
                    className="stamp rounded-plate border border-line bg-plate px-4 py-2.5 text-[12px] text-ink hover:border-ink"
                  >
                    Details
                  </Link>
                </div>
              </div>
            </Plate>
          ))}
        </div>
      )}

      {booking ? (
        <BookingDialog
          equipment={booking}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setBooking(null)}
          onBooked={(b) => router.push(`/bookings/${b.id}`)}
        />
      ) : null}
    </>
  );
}

function BookingDialog({
  equipment,
  defaultFrom,
  defaultTo,
  onClose,
  onBooked,
}: {
  equipment: Equipment;
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
  onBooked: (b: Booking) => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ code: string; startDate: string; endDate: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Inclusive on both ends, matching the server's overlap rule: a 1st–3rd
  // booking occupies three days, not two.
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
    ) + 1,
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConflict(null);
    setSaving(true);
    try {
      const created = await api.post<Booking>("/api/bookings", {
        equipmentId: equipment.id,
        startDate: `${from}T00:00:00.000Z`,
        endDate: `${to}T00:00:00.000Z`,
      });
      onBooked(created);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // The 409 carries the booking you collided with — show it rather than
        // making the client guess which dates to try next.
        const c = (err.details as { conflictingBooking?: { code: string; startDate: string; endDate: string } })
          ?.conflictingBooking;
        if (c) setConflict(c);
      } else {
        setError(String(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${equipment.code}`}
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Plate title={`Book ${equipment.code}`} meta={equipment.type.replace(/_/g, " ")} tone="hivis">
          <form onSubmit={submit} className="grid gap-3">
            <p className="text-sm text-steel">{equipment.name}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start" name="startDate" type="date" value={from}
                onChange={(e) => setFrom(e.target.value)} required />
              <Field label="End" name="endDate" type="date" value={to}
                onChange={(e) => setTo(e.target.value)} required
                error={from > to ? "Must be after the start" : undefined} />
            </div>

            <div className="rounded-plate border border-line bg-dust/60 p-3">
              <div className="flex items-baseline justify-between">
                <span className="stamp text-[10px] text-mute">{days} day{days === 1 ? "" : "s"} × ${equipment.dailyRate.toFixed(2)}</span>
                <span className="font-mono text-lg">${(days * equipment.dailyRate).toFixed(2)}</span>
              </div>
              <p className="mt-1 text-[13px] text-mute">
                Estimate only. The final total is calculated at check-in from the time you actually hold the machine.
              </p>
            </div>

            {error ? (
              <div className="rounded-plate border border-alert/40 bg-alert/8 p-3">
                <p className="text-[13px] text-alert">{error}</p>
                {conflict ? (
                  <p className="mt-1 font-mono text-[12px] text-steel">
                    {conflict.code}: {conflict.startDate.slice(0, 10)} → {conflict.endDate.slice(0, 10)}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={saving} disabled={from > to}>Request booking</Button>
            </div>
            <p className="text-[13px] text-mute">
              Bookings start as <strong>pending</strong>. An admin confirms it, and your QR is issued then.
            </p>
          </form>
        </Plate>
      </div>
    </div>
  );
}
