import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface BookingConfirmedInput {
  clientName: string;
  bookingCode: string;
  equipmentCode: string;
  equipmentName: string;
  startDate: Date;
  endDate: Date;
  dailyRate: number;
}

/** QR image is attached by the caller (Person B's lib/qr.ts owns generation) — this template just references it. */
export function renderBookingConfirmed(input: BookingConfirmedInput): RenderedEmail {
  const body = `
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p>Your booking is confirmed. Your check-in/check-out QR is attached — show it to staff at pickup.</p>
    ${table(
      [
        row("Booking", input.bookingCode),
        row("Equipment", `${input.equipmentName} (${input.equipmentCode})`),
        row("Start", input.startDate.toDateString()),
        row("End", input.endDate.toDateString()),
        row("Daily rate", `$${input.dailyRate.toFixed(2)}`),
      ].join(""),
    )}
  `;
  return {
    subject: `Booking confirmed — ${input.equipmentCode}`,
    html: emailLayout("Booking confirmed", body),
  };
}
