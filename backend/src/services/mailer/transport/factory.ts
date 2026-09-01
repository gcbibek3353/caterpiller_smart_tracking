import { ConsoleMailTransport } from "./console";
import { ResendMailTransport } from "./resend";
import type { MailTransport } from "../types";

export interface MailTransportConfig {
  mailMode: "console" | "resend";
  mailFrom: string;
  resendApiKey?: string;
  /** Only used in console mode. */
  mailDir?: string;
}

/**
 * Picks the transport per `MAIL_MODE` (steps.md §10). Takes plain values
 * rather than importing env.ts directly, so this stays testable without a
 * full parsed environment — wire it up at the real call site with
 * `createMailTransport({ mailMode: env.MAIL_MODE, mailFrom: env.MAIL_FROM, resendApiKey: env.RESEND_API_KEY })`.
 */
export function createMailTransport(config: MailTransportConfig): MailTransport {
  if (config.mailMode === "resend") {
    if (!config.resendApiKey) {
      throw new Error("MAIL_MODE=resend requires RESEND_API_KEY to be set");
    }
    return new ResendMailTransport({ apiKey: config.resendApiKey, from: config.mailFrom });
  }
  return new ConsoleMailTransport(config.mailDir ?? `${process.cwd()}/.mail`);
}
