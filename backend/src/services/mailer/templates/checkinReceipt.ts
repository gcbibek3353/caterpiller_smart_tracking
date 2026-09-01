import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface CheckinReceiptInput {
  clientName: string;
  equipmentCode: string;
  equipmentName: string;
  durationDays: number;
  totalEngineHours: number;
  totalAmount: number;
}

export function renderCheckinReceipt(input: CheckinReceiptInput): RenderedEmail {
  const body = `
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p>${escapeHtml(input.equipmentName)} (${escapeHtml(input.equipmentCode)}) has been returned. Thanks for renting with us.</p>
    ${table(
      [
        row("Duration", `${input.durationDays} day(s)`),
        row("Total engine hours", input.totalEngineHours.toFixed(1)),
        row("Amount", `$${input.totalAmount.toFixed(2)}`),
      ].join(""),
    )}
  `;
  return {
    subject: `Checked in — ${input.equipmentCode}`,
    html: emailLayout("Check-in receipt", body),
  };
}
