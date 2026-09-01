import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface CheckoutReceiptInput {
  clientName: string;
  equipmentCode: string;
  equipmentName: string;
  meterHours: number;
  fuelPct: number;
  expectedReturn: Date;
}

export function renderCheckoutReceipt(input: CheckoutReceiptInput): RenderedEmail {
  const body = `
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p>${escapeHtml(input.equipmentName)} (${escapeHtml(input.equipmentCode)}) has been checked out.</p>
    ${table(
      [
        row("Meter hours at checkout", input.meterHours.toFixed(1)),
        row("Fuel level", `${input.fuelPct.toFixed(0)}%`),
        row("Expected return", input.expectedReturn.toDateString()),
      ].join(""),
    )}
  `;
  return {
    subject: `Checked out — ${input.equipmentCode}`,
    html: emailLayout("Checkout receipt", body),
  };
}
