import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface OverdueInput {
  clientName: string;
  equipmentCode: string;
  daysOverdue: number;
  accruingChargePerDay: number;
}

export function renderOverdue(input: OverdueInput): RenderedEmail {
  const totalAccrued = input.daysOverdue * input.accruingChargePerDay;
  const body = `
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p style="color: #b91c1c; font-weight: 600;">${escapeHtml(input.equipmentCode)} is overdue for return.</p>
    ${table(
      [
        row("Days overdue", String(input.daysOverdue)),
        row("Accruing charge", `$${input.accruingChargePerDay.toFixed(2)}/day`),
        row("Accrued so far", `$${totalAccrued.toFixed(2)}`),
      ].join(""),
    )}
    <p>Please return the equipment as soon as possible to avoid further charges.</p>
  `;
  return {
    subject: `OVERDUE — ${input.equipmentCode} (${input.daysOverdue}d)`,
    html: emailLayout("Overdue return", body),
  };
}
