import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface ReturnReminderInput {
  clientName: string;
  equipmentCode: string;
  returnBy: Date;
  daysLeft: number; // 3 or 1, per steps.md §10
  extendUrl?: string;
}

export function renderReturnReminder(input: ReturnReminderInput): RenderedEmail {
  const extend = input.extendUrl
    ? `<p><a href="${escapeHtml(input.extendUrl)}" style="color: #2563eb;">Need more time? Extend this booking</a></p>`
    : "";
  const body = `
    <p>Hi ${escapeHtml(input.clientName)},</p>
    <p>Reminder: ${escapeHtml(input.equipmentCode)} is due back in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}.</p>
    ${table(row("Return by", input.returnBy.toDateString()))}
    ${extend}
  `;
  return {
    subject: `Return reminder — ${input.equipmentCode} due in ${input.daysLeft} day${input.daysLeft === 1 ? "" : "s"}`,
    html: emailLayout("Return reminder", body),
  };
}
