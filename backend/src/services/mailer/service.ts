import type { PrismaClient } from "@prisma/client";
import { buildPendingNotification } from "./notification";
import type { MailTransport, NotificationType, RenderedEmail } from "./types";

export interface SendMailParams {
  userId: string;
  to: string;
  type: NotificationType;
  rendered: RenderedEmail;
  /** `"{TYPE}:{scopeId}:{bucket}"` — steps.md §9/§10. Unique per Notification row; a repeat send is a no-op. */
  dedupeKey: string;
}

export interface SendMailResult {
  notificationId: string;
  sent: boolean;
  /** True when this call found an existing row for `dedupeKey` and skipped sending again. */
  deduped: boolean;
  error?: string;
}

/**
 * The real `sendMail()` B5 stubs against (plan-24h.md D4). Writes a
 * `Notification` row `PENDING` first, sends through `transport`, then
 * flips it to `SENT`/`FAILED` — steps.md §10: "every send writes a
 * Notification row PENDING first". A repeat call with the same
 * `dedupeKey` is a no-op (idempotent, same idiom as the anomaly runner).
 */
export async function sendMail(
  prisma: PrismaClient,
  transport: MailTransport,
  params: SendMailParams,
): Promise<SendMailResult> {
  const pending = buildPendingNotification(params.userId, params.type, params.rendered, params.dedupeKey);

  let row: { id: string };
  try {
    row = await prisma.notification.create({ data: pending });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await prisma.notification.findUnique({ where: { dedupeKey: params.dedupeKey } });
      return { notificationId: existing?.id ?? "", sent: existing?.status === "SENT", deduped: true };
    }
    throw err;
  }

  const result = await transport.send(params.to, params.rendered);
  if (result.ok) {
    await prisma.notification.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
    return { notificationId: row.id, sent: true, deduped: false };
  }

  await prisma.notification.update({ where: { id: row.id }, data: { status: "FAILED", error: result.error } });
  return { notificationId: row.id, sent: false, deduped: false, error: result.error };
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "P2002";
}
