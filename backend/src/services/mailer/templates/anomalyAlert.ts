import { emailLayout, escapeHtml, row, table } from "./layout";
import type { RenderedEmail } from "../types";

export interface AnomalyAlertInput {
  equipmentCode: string;
  equipmentName: string;
  anomalyType: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  detectedAt: Date;
  mapUrl?: string;
}

/** Fires for any HIGH-severity anomaly (steps.md §10) — breaks out into its own immediate mail rather than the hourly digest. */
export function renderAnomalyAlert(input: AnomalyAlertInput): RenderedEmail {
  const mapLink = input.mapUrl
    ? `<p><a href="${escapeHtml(input.mapUrl)}" style="color: #2563eb;">View on map</a></p>`
    : "";
  const body = `
    <p style="color: #b91c1c; font-weight: 600;">${input.severity} anomaly on ${escapeHtml(input.equipmentName)} (${escapeHtml(input.equipmentCode)})</p>
    ${table(
      [row("Type", input.anomalyType), row("Detected", input.detectedAt.toISOString()), row("Details", input.message)].join(
        "",
      ),
    )}
    ${mapLink}
  `;
  return {
    subject: `[${input.severity}] ${input.anomalyType} — ${input.equipmentCode}`,
    html: emailLayout("Anomaly alert", body),
  };
}
