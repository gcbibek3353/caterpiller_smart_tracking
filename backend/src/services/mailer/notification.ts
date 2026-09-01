import type { NotificationLike, NotificationType, RenderedEmail } from "./types";

/**
 * Builds the `Notification` row to write BEFORE sending (steps.md §10:
 * "every send writes a Notification row PENDING first, then flips to
 * SENT/FAILED"). Pure — the caller does the actual DB write once Prisma is
 * wired up.
 */
export function buildPendingNotification(
  userId: string,
  type: NotificationType,
  rendered: RenderedEmail,
  dedupeKey: string,
): NotificationLike {
  return {
    userId,
    type,
    subject: rendered.subject,
    body: rendered.html,
    channel: "EMAIL",
    status: "PENDING",
    dedupeKey,
    sentAt: null,
    error: null,
  };
}

export function markSent(notification: NotificationLike, sentAt: Date): NotificationLike {
  return { ...notification, status: "SENT", sentAt, error: null };
}

export function markFailed(notification: NotificationLike, error: string): NotificationLike {
  return { ...notification, status: "FAILED", error };
}
