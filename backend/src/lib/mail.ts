import { createMailTransport } from "../services/mailer/transport/factory";
import type { MailTransport } from "../services/mailer/types";
import { env } from "../env";

/**
 * The app's single mail transport, wired from env at the real call site as
 * `services/mailer/transport/factory.ts` asks for.
 *
 * Lazy so that importing a route module does not construct a Resend client (or
 * touch the filesystem for the console transport's `.mail/` directory) until
 * something actually sends.
 */
let transport: MailTransport | undefined;

export function mailer(): MailTransport {
  transport ??= createMailTransport({
    mailMode: env.MAIL_MODE,
    mailFrom: env.MAIL_FROM,
    resendApiKey: env.RESEND_API_KEY || undefined,
  });
  return transport;
}
