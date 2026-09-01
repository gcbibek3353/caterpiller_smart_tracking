import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import type { BookingStatus, CheckType } from "@prisma/client";
import { prisma } from "../db";
import { conflict, notFound, ok } from "../lib/http";
import { num, serializeBooking } from "../lib/serialize";
import { requireAuth, requireRole } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import { ScanCommitInput, ScanResolveInput } from "../contracts";
import { isBookingOverdue } from "../lib/overdue";
import { mailer } from "../lib/mail";
import { sendMail } from "../services/mailer/service";
import { renderCheckoutReceipt } from "../services/mailer/templates/checkoutReceipt";
import { renderCheckinReceipt } from "../services/mailer/templates/checkinReceipt";
import type { AppEnv } from "../types";

export const scanRoutes = new Hono<AppEnv>();

// Scanning is staff-only. A client holding their own QR must not be able to
// check themselves out.
scanRoutes.use("*", requireAuth, requireRole("ADMIN"));

/**
 * The whole state machine, in one place (steps.md §5).
 *
 * The SERVER decides check-out vs check-in from `booking.status`. The client
 * never picks — that is why one token serves both directions.
 */
const ACTION_FOR: Partial<Record<BookingStatus, CheckType>> = {
  CONFIRMED: "CHECK_OUT",
  CHECKED_OUT: "CHECK_IN",
};

/** Why a scan is refused, in words staff can act on. */
const REFUSAL: Partial<Record<BookingStatus, string>> = {
  PENDING: "Booking not confirmed yet — an admin must confirm it before it can be checked out",
  RETURNED: "This QR has already been used — the machine was checked back in",
  CANCELLED: "This booking was cancelled, so its QR is no longer valid",
};

const bookingForScan = {
  equipment: {
    select: { id: true, code: true, name: true, type: true, imageUrl: true, status: true },
  },
  client: { select: { id: true, name: true, companyName: true, email: true, phone: true } },
  site: { select: { id: true, name: true, lat: true, lng: true, radiusMeters: true } },
  operator: { select: { id: true, name: true, phone: true } },
} satisfies Prisma.BookingInclude;

/** Shared lookup: an unknown token is a 404, never a hint about which tokens exist. */
async function findByToken(token: string) {
  const booking = await prisma.booking.findUnique({
    where: { qrToken: token },
    include: bookingForScan,
  });
  if (!booking) throw notFound("QR code");
  return booking;
}

/** The preview payload — deliberately the same shape from resolve and commit. */
const preview = (booking: Awaited<ReturnType<typeof findByToken>>, action: CheckType) => {
  const { qrToken: _qrToken, ...safe } = booking;
  return { action, booking: serializeBooking(safe) };
};

// ── POST /api/scan/resolve — preview only, no writes ──────────────────
/**
 * Step one of the two-step scan. Staff eyeball this before committing;
 * one-step scanning causes accidental check-ins that are painful to undo.
 */
scanRoutes.post("/resolve", validate("json", ScanResolveInput), async (c) => {
  const { token } = valid(c, "json", ScanResolveInput);
  const booking = await findByToken(token);

  const action = ACTION_FOR[booking.status];
  if (!action) {
    // Carry the booking in `details` so the scanner screen can still show what
    // was scanned rather than just an error string.
    const { qrToken: _qrToken, ...safe } = booking;
    throw conflict(REFUSAL[booking.status] ?? `Cannot scan a ${booking.status} booking`, {
      status: booking.status,
      booking: serializeBooking(safe),
    });
  }

  const lastCheckout = await prisma.checkEvent.findFirst({
    where: { bookingId: booking.id, type: "CHECK_OUT" },
    orderBy: { at: "desc" },
    select: { at: true, meterHours: true, fuelPct: true },
  });

  return ok(c, {
    ...preview(booking, action),
    // Prefill for the meter/fuel form on a check-in, so staff correct a number
    // rather than type one from scratch.
    lastCheckout,
    isOverdue: isBookingOverdue(booking.status, booking.endDate),
  });
});

/**
 * A booking that just transitioned is not scannable again for this long.
 *
 * Without it, the state machine is technically correct but practically awful:
 * a double-tapped commit checks a machine OUT and then straight back IN, since
 * the second request re-reads the status the first just wrote and finds a
 * legitimate CHECK_IN waiting. Four concurrent scans left a booking RETURNED
 * seconds after it was checked out.
 *
 * A status guard alone cannot catch this — both writes are valid transitions.
 * The thing that makes it wrong is that no human scanned twice in two seconds,
 * which is what steps.md §5 means by "accidental check-ins that are painful to
 * undo". Ten seconds is far below any real check-out-then-return.
 */
const RESCAN_COOLDOWN_MS = 10_000;

/**
 * Billing runs on time actually held, not the window originally booked, so a
 * late return costs more and an early one costs less. Part-days round up: a
 * machine off the lot for 25 hours has cost the yard two days of availability.
 * Minimum one day, so a same-day return is never free.
 */
function billableDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

// ── POST /api/scan/commit — performs the action ───────────────────────
scanRoutes.post("/commit", validate("json", ScanCommitInput), async (c) => {
  const body = valid(c, "json", ScanCommitInput);
  const user = c.get("user");

  const found = await findByToken(body.token);
  const expected = ACTION_FOR[found.status];
  if (!expected) {
    throw conflict(REFUSAL[found.status] ?? `Cannot scan a ${found.status} booking`, {
      status: found.status,
    });
  }

  /**
   * `action` in the body is advisory only. If the client thinks it is checking
   * out a machine the server considers already out, that is a stale scanner
   * screen — refuse rather than silently perform the other action.
   */
  if (body.action && body.action !== expected) {
    throw conflict(
      `This booking is ready for ${expected}, not ${body.action}. Re-scan to refresh the preview.`,
      { expected, requested: body.action },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    /**
     * Re-read inside the transaction (steps.md §5) — but the guard that
     * actually holds is the status in this WHERE clause. `updateMany` returns
     * a count, so a double-tap loses the race atomically at any isolation
     * level, without needing Serializable and its retries.
     */
    const fromStatus: BookingStatus = expected === "CHECK_OUT" ? "CONFIRMED" : "CHECKED_OUT";
    const toStatus: BookingStatus = expected === "CHECK_OUT" ? "CHECKED_OUT" : "RETURNED";
    const now = new Date();

    /**
     * Read inside the transaction so it serialises against a concurrent commit
     * on the same booking.
     */
    const lastEvent = await tx.checkEvent.findFirst({
      where: { bookingId: found.id },
      orderBy: { at: "desc" },
      select: { at: true, type: true },
    });
    if (lastEvent && now.getTime() - lastEvent.at.getTime() < RESCAN_COOLDOWN_MS) {
      const ago = Math.round((now.getTime() - lastEvent.at.getTime()) / 1000);
      throw conflict(
        `This booking was ${lastEvent.type === "CHECK_OUT" ? "checked out" : "checked in"} ` +
          `${ago}s ago. Wait a moment and re-scan — scanning twice in quick succession ` +
          `would ${expected === "CHECK_IN" ? "immediately return a machine that just left the yard" : "re-fire the same action"}.`,
        { lastAction: lastEvent.type, secondsAgo: ago },
      );
    }

    const claimed = await tx.booking.updateMany({
      where: { id: found.id, status: fromStatus },
      data:
        expected === "CHECK_OUT"
          ? { status: toStatus, checkoutAt: now }
          : { status: toStatus, checkinAt: now },
    });
    if (claimed.count !== 1) {
      // Someone else committed between our read and this write.
      throw conflict("This QR was just scanned by someone else — re-scan to see the new state");
    }

    const event = await tx.checkEvent.create({
      data: {
        bookingId: found.id,
        type: expected,
        at: now,
        scannedById: user.id,
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        meterHours: body.meterHours ?? null,
        fuelPct: body.fuelPct ?? null,
        conditionNotes: body.conditionNotes ?? null,
        photoUrl: body.photoUrl ?? null,
      },
    });

    // The machine's own status follows the booking (steps.md §5 side effects).
    await tx.equipment.update({
      where: { id: found.equipmentId },
      data: { status: expected === "CHECK_OUT" ? "CHECKED_OUT" : "AVAILABLE" },
      select: { id: true },
    });

    let totalAmount: Prisma.Decimal | null = null;
    let days = 0;
    let engineHours = 0;

    if (expected === "CHECK_IN") {
      const checkedOutAt = found.checkoutAt ?? found.startDate;
      days = billableDays(checkedOutAt, now);
      totalAmount = new Prisma.Decimal(found.dailyRate).mul(days);

      const outEvent = await tx.checkEvent.findFirst({
        where: { bookingId: found.id, type: "CHECK_OUT" },
        orderBy: { at: "desc" },
        select: { meterHours: true },
      });
      if (outEvent?.meterHours != null && body.meterHours != null) {
        engineHours = Math.max(0, body.meterHours - outEvent.meterHours);
      }

      await tx.booking.update({
        where: { id: found.id },
        data: { totalAmount },
        select: { id: true },
      });
    }

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: found.id },
      include: bookingForScan,
    });

    return { booking, event, days, engineHours, totalAmount };
  });

  /**
   * Receipt goes out after the transaction commits, never inside it — a slow
   * mail call would hold the booking and equipment rows locked. A failure is
   * recorded as a FAILED Notification row and never undoes a scan the staff
   * member already saw succeed.
   */
  let emailed = false;
  let emailError: string | undefined;
  try {
    const { booking } = result;
    const rendered =
      expected === "CHECK_OUT"
        ? renderCheckoutReceipt({
            clientName: booking.client.name,
            equipmentCode: booking.equipment.code,
            equipmentName: booking.equipment.name,
            meterHours: body.meterHours ?? 0,
            fuelPct: body.fuelPct ?? 0,
            expectedReturn: booking.endDate,
          })
        : renderCheckinReceipt({
            clientName: booking.client.name,
            equipmentCode: booking.equipment.code,
            equipmentName: booking.equipment.name,
            durationDays: result.days,
            totalEngineHours: result.engineHours,
            totalAmount: num(result.totalAmount) ?? 0,
          });

    const sent = await sendMail(prisma, mailer(), {
      userId: booking.clientId,
      to: booking.client.email,
      type: expected === "CHECK_OUT" ? "CHECKOUT_RECEIPT" : "CHECKIN_RECEIPT",
      // Keyed on the CheckEvent, so a retry of the same scan dedupes but a
      // genuine second scan of the same booking still sends.
      dedupeKey: `${expected === "CHECK_OUT" ? "CHECKOUT_RECEIPT" : "CHECKIN_RECEIPT"}:${booking.id}:${result.event.id}`,
      rendered,
    });
    emailed = sent.sent;
    emailError = sent.error;
  } catch (err) {
    emailError = err instanceof Error ? err.message : String(err);
    console.error("[scan] committed but receipt failed", result.booking.code, emailError);
  }

  const { qrToken: _qrToken, ...safe } = result.booking;
  return ok(c, {
    action: expected,
    booking: serializeBooking(safe),
    checkEvent: result.event,
    ...(expected === "CHECK_IN"
      ? { billableDays: result.days, totalEngineHours: result.engineHours }
      : {}),
    emailed,
    ...(emailError ? { emailError } : {}),
  });
});
