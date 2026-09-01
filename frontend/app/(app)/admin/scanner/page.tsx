"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import type { BookingWithRelations, ScanPreview, ScanReceipt } from "@/lib/types";
import { Plate, PlateRow, PlateRows } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { TextArea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/status";
import { EquipmentPhoto } from "@/components/equipment/EquipmentPhoto";
import { CameraScanner } from "@/components/scan/CameraScanner";

/**
 * The scanner is a four-state machine, and which state you are in is the most
 * important thing on the screen — this gets used one-handed, on a phone, in
 * daylight, by someone also holding a clipboard.
 */
type Stage =
  | { name: "idle" }
  | { name: "resolving" }
  // The raw scanned string is carried through: `resolve` deliberately
  // strips `qrToken` from the booking it returns, so the preview alone
  // cannot commit — the token has to survive from the scan itself.
  | { name: "preview"; token: string; preview: ScanPreview }
  | { name: "refused"; message: string; booking?: BookingWithRelations }
  | { name: "done"; receipt: ScanReceipt };

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const stamp = (iso: string | null) =>
  iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) : "—";

const ACTION_LABEL = { CHECK_OUT: "Check out", CHECK_IN: "Check in" } as const;

export default function AdminScannerPage() {
  const [stage, setStage] = useState<Stage>({ name: "idle" });

  /**
   * Step one of the two-step scan. Nothing is written — staff eyeball the
   * preview and only then commit, which is what stops an accidental check-in
   * that is painful to undo.
   */
  const resolve = useCallback(async (raw: string) => {
    setStage({ name: "resolving" });
    try {
      const preview = await api.post<ScanPreview>("/api/scan/resolve", { token: raw });
      setStage({ name: "preview", token: raw, preview });
    } catch (e) {
      if (e instanceof ApiError) {
        // A 409 carries the booking it refused, so the screen can still show
        // what was scanned rather than only an error string.
        const details = e.details as { booking?: BookingWithRelations } | undefined;
        setStage({ name: "refused", message: e.message, booking: details?.booking });
      } else {
        setStage({ name: "refused", message: String(e) });
      }
    }
  }, []);

  const reset = useCallback(() => setStage({ name: "idle" }), []);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="stamp text-stamp-sm text-hivis">Yard gate</p>
          <h1 className="font-display text-title-lg font-bold uppercase leading-none tracking-tight">
            Scanner
          </h1>
          <p className="mt-2 text-note text-mute">
            One QR does both directions — the server picks check-out or check-in from the
            booking&apos;s own status.
          </p>
        </div>
        <Link
          href="/admin/bookings"
          className="stamp rounded-plate border border-line bg-plate px-4 py-2.5 text-stamp-lg text-ink hover:border-ink"
        >
          All bookings
        </Link>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Plate title="Scan" meta={stage.name === "preview" ? "Paused" : undefined}>
          <CameraScanner onToken={resolve} paused={stage.name === "preview" || stage.name === "done"} />
        </Plate>

        <div className="grid content-start gap-5">
          {stage.name === "idle" ? (
            <Plate title="Waiting">
              <p className="text-body text-steel">
                Point the camera at a booking QR, or type the code. Nothing is written until you
                confirm on the next screen.
              </p>
            </Plate>
          ) : null}

          {stage.name === "resolving" ? (
            <Plate title="Looking up">
              <p className="stamp text-stamp text-mute">Reading the booking…</p>
            </Plate>
          ) : null}

          {stage.name === "refused" ? (
            <Refused message={stage.message} booking={stage.booking} onReset={reset} />
          ) : null}

          {stage.name === "preview" ? (
            <CommitPanel
              token={stage.token}
              preview={stage.preview}
              onCancel={reset}
              onCommitted={(receipt) => setStage({ name: "done", receipt })}
            />
          ) : null}

          {stage.name === "done" ? <Receipt receipt={stage.receipt} onNext={reset} /> : null}
        </div>
      </div>
    </>
  );
}

// ── The three refusals (B11) ─────────────────────────────────────────

/**
 * A refused scan is not an error to apologise for — it is a state with a next
 * step, and on a phone at the gate that step needs to be one tap away. A
 * PENDING booking in particular is refused only because nobody has confirmed
 * it yet, and the person holding the scanner is an admin who can.
 *
 * Deliberately NOT `tone="hivis"`: the accent means "you can act on this", so
 * spending it on the panel chrome would make every refusal shout. It goes on
 * the action instead.
 */
function Refused({
  message,
  booking,
  onReset,
}: {
  message: string;
  booking?: BookingWithRelations;
  onReset: () => void;
}) {
  const status = booking?.status;
  return (
    <Plate title="Cannot scan this" meta={booking?.code}>
      <p className="rounded-plate border border-alert/40 bg-alert/8 p-3 text-body text-alert">
        {message}
      </p>

      {booking ? (
        <div className="mt-4">
          <BookingIdentity booking={booking} />
        </div>
      ) : null}

      <p className="mt-4 text-note text-steel">
        {status === "PENDING"
          ? "Nothing is wrong with the machine or the code — this booking just has not been confirmed yet. Confirm it on the bookings desk and the same QR will scan."
          : status === "RETURNED"
            ? "This rental is closed. If the machine is going out again it needs a new booking, which issues a new QR."
            : status === "CANCELLED"
              ? "Cancelled bookings never get a working QR back. The client has to book again."
              : "Check the code and try again, or type it in by hand."}
      </p>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {booking && status !== "PENDING" ? (
          <Link
            href={`/bookings/${booking.id}`}
            className="stamp rounded-plate border border-line bg-plate px-4 py-2.5 text-stamp-lg text-ink hover:border-ink"
          >
            Open booking
          </Link>
        ) : null}
        {status === "PENDING" ? (
          <Link
            href="/admin/bookings?status=PENDING"
            className="stamp rounded-plate border border-transparent bg-hivis px-4 py-2.5 text-stamp-lg text-ink hover:bg-hivis-deep hover:text-plate"
          >
            Confirm it
          </Link>
        ) : null}
        <Button variant={status === "PENDING" ? "secondary" : "primary"} onClick={onReset}>
          Scan another
        </Button>
      </div>
    </Plate>
  );
}

// ── Who and what was scanned ─────────────────────────────────────────

function BookingIdentity({ booking }: { booking: BookingWithRelations }) {
  return (
    <>
      {/* Staff check the picture against the machine in front of them before
          committing — that is the whole point of the two-step scan. */}
      <EquipmentPhoto
        src={booking.equipment?.imageUrl}
        alt={`${booking.equipment?.code} — ${booking.equipment?.name}`}
        type={booking.equipment?.type}
        sizes="(max-width: 1024px) 100vw, 400px"
        className="mb-3 aspect-[16/9] w-full"
      />
    <PlateRows>
      <PlateRow label="Booking" value={booking.code} />
      <PlateRow
        label="Client"
        value={booking.client?.companyName ?? booking.client?.name ?? "—"}
        mono={false}
      />
      <PlateRow label="Machine" value={`${booking.equipment?.code} · ${booking.equipment?.name}`} />
      <PlateRow label="Window" value={`${day(booking.startDate)} → ${day(booking.endDate)}`} />
      {booking.checkoutAt ? <PlateRow label="Checked out" value={stamp(booking.checkoutAt)} /> : null}
      {/* The "already used" refusal is much easier to trust with a timestamp on it. */}
      {booking.checkinAt ? <PlateRow label="Checked in" value={stamp(booking.checkinAt)} /> : null}
      <PlateRow label="Site" value={booking.site?.name ?? "Not assigned"} mono={false} />
      <PlateRow label="Operator" value={booking.operator?.name ?? "Not assigned"} mono={false} />
      <PlateRow label="Status" value={<StatusPill status={booking.status} kind="booking" />} mono={false} />
    </PlateRows>
    </>
  );
}

// ── Step two: the meter / fuel / condition form ──────────────────────

function CommitPanel({
  token,
  preview,
  onCancel,
  onCommitted,
}: {
  /** The raw scanned string. `QrToken` accepts the full payload or a bare token. */
  token: string;
  preview: ScanPreview;
  onCancel: () => void;
  onCommitted: (receipt: ScanReceipt) => void;
}) {
  const { action, booking, lastCheckout, isOverdue } = preview;

  /**
   * On a check-in the meter is prefilled with what it read on the way out, so
   * staff correct a number rather than type one from scratch — and a typo that
   * lowers the reading is visible against the prefill.
   */
  const [meterHours, setMeterHours] = useState(
    action === "CHECK_IN" && lastCheckout?.meterHours != null ? String(lastCheckout.meterHours) : "",
  );
  const [fuelPct, setFuelPct] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [attachLocation, setAttachLocation] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const outMeter = lastCheckout?.meterHours ?? null;
  const meterWentBackwards =
    action === "CHECK_IN" && outMeter != null && meterHours !== "" && Number(meterHours) < outMeter;

  /** Best-effort and opt-in: a permission prompt mid-demo is worse than no fix. */
  async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
    if (!attachLocation || !navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 4000, maximumAge: 60_000 },
      );
    });
  }

  async function commit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFieldErrors({});

    const where = await currentPosition();
    const payload: Record<string, string | number> = {
      token,
      // `action` is advisory — the server decides from booking.status and
      // refuses if this disagrees, which is exactly what we want a stale
      // preview to do rather than silently performing the other direction.
      action,
      ...(meterHours !== "" ? { meterHours: Number(meterHours) } : {}),
      ...(fuelPct !== "" ? { fuelPct: Number(fuelPct) } : {}),
      ...(conditionNotes.trim() ? { conditionNotes: conditionNotes.trim() } : {}),
      ...(photoUrl.trim() ? { photoUrl: photoUrl.trim() } : {}),
      ...(where ? { lat: where.lat, lng: where.lng } : {}),
    };

    try {
      const receipt = await api.post<ScanReceipt>("/api/scan/commit", payload);
      onCommitted(receipt);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError(String(err));
      }
      setSaving(false);
    }
  }

  return (
    <Plate
      title={ACTION_LABEL[action]}
      meta={booking.code}
      tone="hivis"
    >
      <div
        className={`mb-4 rounded-plate border p-3 ${
          action === "CHECK_OUT"
            ? "border-busy/35 bg-busy/8"
            : "border-ok/35 bg-ok/8"
        }`}
      >
        <p className="font-display text-title font-bold uppercase leading-none">
          {action === "CHECK_OUT" ? "Machine leaving the yard" : "Machine coming back"}
        </p>
        {isOverdue ? (
          <p className="stamp mt-2 inline-block rounded-plate border border-alert/40 bg-alert/12 px-2 py-1 text-stamp-sm leading-none text-alert">
            Overdue — was due {day(booking.endDate)}
          </p>
        ) : null}
      </div>

      <BookingIdentity booking={booking} />

      {lastCheckout ? (
        <p className="mt-3 rounded-plate border border-line bg-dust/60 p-3 text-note text-steel">
          Went out {stamp(lastCheckout.at)} at{" "}
          <span className="font-mono">{lastCheckout.meterHours ?? "—"} h</span> /{" "}
          <span className="font-mono">{lastCheckout.fuelPct ?? "—"}%</span> fuel.
        </p>
      ) : null}

      <form onSubmit={commit} className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Meter hours"
            name="meterHours"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={meterHours}
            onChange={(e) => setMeterHours(e.target.value)}
            error={fieldErrors.meterHours}
            hint={meterWentBackwards ? undefined : outMeter != null ? `Out at ${outMeter} h` : undefined}
          />
          <Field
            label="Fuel %"
            name="fuelPct"
            type="number"
            min="0"
            max="100"
            inputMode="decimal"
            value={fuelPct}
            onChange={(e) => setFuelPct(e.target.value)}
            error={fieldErrors.fuelPct}
          />
        </div>

        {meterWentBackwards ? (
          <p className="rounded-plate border border-warn/40 bg-warn/10 p-3 text-note text-warn">
            That is lower than the {outMeter} h recorded at check-out. Worth a second look — the
            server will accept it, but the engine-hours line on the receipt goes to zero.
          </p>
        ) : null}

        <TextArea
          label="Condition notes"
          name="conditionNotes"
          rows={3}
          value={conditionNotes}
          onChange={(e) => setConditionNotes(e.target.value)}
          placeholder="Scratched left panel, tracks worn…"
          error={fieldErrors.conditionNotes}
        />

        <Field
          label="Photo URL"
          name="photoUrl"
          type="url"
          placeholder="https://…"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          error={fieldErrors.photoUrl}
          hint="Optional link — there is no upload endpoint"
        />

        <label className="flex items-center gap-2.5 text-note text-steel">
          <input
            type="checkbox"
            checked={attachLocation}
            onChange={(e) => setAttachLocation(e.target.checked)}
            className="size-4 accent-[var(--color-hivis)]"
          />
          Attach this device&apos;s location to the check event
        </label>

        {error ? (
          <div className="rounded-plate border border-alert/40 bg-alert/8 p-3">
            <p className="text-note text-alert">{error}</p>
            <p className="mt-1.5 text-note text-steel">
              Re-scan to refresh the preview — the booking may have moved on since this screen
              was drawn.
            </p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" loading={saving} className="min-w-[10rem]">
            Confirm {ACTION_LABEL[action].toLowerCase()}
          </Button>
        </div>
      </form>
    </Plate>
  );
}

// ── Step three: what just happened ───────────────────────────────────

function Receipt({ receipt, onNext }: { receipt: ScanReceipt; onNext: () => void }) {
  const { action, booking, checkEvent, billableDays, totalEngineHours, emailed, emailError } = receipt;

  return (
    <Plate title={`${ACTION_LABEL[action]} recorded`} meta={booking.code} tone="hivis">
      <div className="mb-4 rounded-plate border border-ok/35 bg-ok/8 p-3">
        <p className="font-display text-title font-bold uppercase leading-none text-ok">
          {action === "CHECK_OUT" ? "Checked out" : "Checked in"}
        </p>
        <p className="mt-1.5 text-note text-steel">
          {booking.equipment?.code} is now{" "}
          <strong>{action === "CHECK_OUT" ? "CHECKED OUT" : "AVAILABLE"}</strong>.
        </p>
      </div>

      <PlateRows>
        <PlateRow label="Booking" value={<StatusPill status={booking.status} kind="booking" />} mono={false} />
        <PlateRow label="At" value={stamp(checkEvent.at)} />
        <PlateRow label="Meter" value={checkEvent.meterHours != null ? `${checkEvent.meterHours} h` : "—"} />
        <PlateRow label="Fuel" value={checkEvent.fuelPct != null ? `${checkEvent.fuelPct}%` : "—"} />
        {action === "CHECK_IN" ? (
          <>
            <PlateRow label="Billable days" value={billableDays ?? "—"} />
            <PlateRow label="Engine hours used" value={totalEngineHours != null ? `${totalEngineHours.toFixed(1)} h` : "—"} />
            <PlateRow
              label="Total"
              value={booking.totalAmount != null ? `$${booking.totalAmount.toFixed(2)}` : "—"}
            />
          </>
        ) : null}
      </PlateRows>

      <p
        className={`mt-4 rounded-plate border p-3 text-note ${
          emailed ? "border-ok/35 bg-ok/8 text-ok" : "border-warn/40 bg-warn/10 text-warn"
        }`}
      >
        {emailed
          ? `Receipt emailed to ${booking.client?.email ?? "the client"}.`
          : `Recorded, but the receipt did not send${emailError ? `: ${emailError}` : ""}. The scan itself stands — the failed notification shows on /alerts.`}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Link
          href={`/bookings/${booking.id}`}
          className="stamp rounded-plate border border-line bg-plate px-4 py-2.5 text-stamp-lg text-ink hover:border-ink"
        >
          Open booking
        </Link>
        <Button onClick={onNext}>Scan next</Button>
      </div>
    </Plate>
  );
}
