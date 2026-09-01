import QRCode from "qrcode";
import { QR_PREFIX } from "../contracts/scan";

/**
 * QR generation for booking check-in/check-out (steps.md §5).
 *
 * The payload is `RENT:v1:<token>` and nothing else — no PII, no JSON, no
 * booking id. The token is opaque and revocable in the DB, so a photographed
 * QR leaks nothing and can be invalidated without reissuing anything else.
 *
 * `QR_PREFIX` is imported from the scan contract rather than redeclared, so the
 * writer and the reader can never drift apart.
 */
export const qrPayload = (qrToken: string): string => `${QR_PREFIX}${qrToken}`;

/**
 * Error correction M and a wide quiet zone on purpose: this gets scanned off a
 * laptop screen from a few feet away in a demo (plan-24h B7), where glare and
 * a phone's autofocus lose more modules than a printed code would.
 */
const OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 4,
  scale: 8,
} as const;

/** PNG bytes — for `GET /api/bookings/:id/qr.png` and the email attachment. */
export async function qrPng(qrToken: string): Promise<Buffer> {
  return QRCode.toBuffer(qrPayload(qrToken), { ...OPTIONS, type: "png" });
}

/** `data:image/png;base64,…` — for rendering inline in the client UI (B7). */
export async function qrDataUrl(qrToken: string): Promise<string> {
  return QRCode.toDataURL(qrPayload(qrToken), OPTIONS);
}
