import { emailLayout, escapeHtml } from "./layout";
import type { RenderedEmail } from "../types";

export interface AnomalyDigestItem {
  equipmentCode: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
}

export interface AnomalyDigestInput {
  recipientName: string;
  windowLabel: string; // e.g. "2026-09-01 14:00–15:00"
  items: AnomalyDigestItem[];
}

/** Hourly grouped digest for MEDIUM anomalies — one email per recipient per hour, max (steps.md §9/§10). */
export function renderAnomalyDigest(input: AnomalyDigestInput): RenderedEmail {
  const rows = input.items
    .map(
      (item) => `<tr>
        <td style="padding: 6px 12px 6px 0; border-bottom: 1px solid #e4e4e7;">${escapeHtml(item.equipmentCode)}</td>
        <td style="padding: 6px 12px 6px 0; border-bottom: 1px solid #e4e4e7;">${escapeHtml(item.type)}</td>
        <td style="padding: 6px 0; border-bottom: 1px solid #e4e4e7;">${escapeHtml(item.message)}</td>
      </tr>`,
    )
    .join("");
  const body = `
    <p>Hi ${escapeHtml(input.recipientName)},</p>
    <p>${input.items.length} anomaly notice(s) for ${escapeHtml(input.windowLabel)}:</p>
    <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
      <thead><tr style="text-align: left; color: #71717a;"><th>Equipment</th><th>Type</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return {
    subject: `Anomaly digest — ${input.items.length} notice(s), ${input.windowLabel}`,
    html: emailLayout("Anomaly digest", body),
  };
}
