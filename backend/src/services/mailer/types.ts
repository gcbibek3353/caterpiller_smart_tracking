export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "CHECKOUT_RECEIPT"
  | "CHECKIN_RECEIPT"
  | "RETURN_REMINDER"
  | "OVERDUE"
  | "ANOMALY_ALERT"
  | "ANOMALY_DIGEST";

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

/**
 * Mirrors the Prisma `Notification` model's relevant fields (steps.md §2).
 * NOTE: schema.prisma doesn't exist in the repo yet — this is modeled
 * straight from the design doc, same pattern as anomaly/types.ts's
 * `DailyUsageLike`/`TelemetryLike`. Swap for the generated Prisma type once
 * Person A ships the schema; the shape here is deliberately a subset so
 * that swap should be a no-op.
 */
export interface NotificationLike {
  userId: string;
  type: NotificationType;
  subject: string;
  body: string; // rendered HTML
  channel: "EMAIL";
  status: "PENDING" | "SENT" | "FAILED";
  dedupeKey: string;
  sentAt?: Date | null;
  error?: string | null;
}

export interface MailTransport {
  send(to: string, rendered: RenderedEmail): Promise<{ ok: true } | { ok: false; error: string }>;
}
