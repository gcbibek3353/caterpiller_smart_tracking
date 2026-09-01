import { z } from "zod";
import { CheckTypeSchema } from "./common";

/** QR payload is exactly `RENT:v1:<token>` — no PII, nothing else. */
export const QR_PREFIX = "RENT:v1:";

/** Accepts the raw scanned string or a bare token (manual-entry fallback). */
export const QrToken = z
  .string()
  .min(8)
  .transform((s) => (s.startsWith(QR_PREFIX) ? s.slice(QR_PREFIX.length) : s.trim()));

export const ScanResolveInput = z.object({ token: QrToken });
export type ScanResolveInput = z.infer<typeof ScanResolveInput>;

export const ScanCommitInput = z.object({
  token: QrToken,
  /**
   * Optional and advisory only. The server decides CHECK_OUT vs CHECK_IN from
   * booking.status inside the transaction; if this disagrees, the request is
   * rejected rather than silently doing the other thing.
   */
  action: CheckTypeSchema.optional(),
  meterHours: z.coerce.number().nonnegative().max(200_000).optional(),
  fuelPct: z.coerce.number().min(0).max(100).optional(),
  conditionNotes: z.string().max(2000).optional(),
  photoUrl: z.string().url().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});
export type ScanCommitInput = z.infer<typeof ScanCommitInput>;
