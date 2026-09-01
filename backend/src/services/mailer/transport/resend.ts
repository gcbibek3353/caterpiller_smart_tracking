import type { MailTransport, RenderedEmail } from "../types";

export interface ResendConfig {
  apiKey: string;
  from: string;
  /** Injectable for tests — defaults to the global `fetch`. Never call this against a real key without asking first. */
  fetchImpl?: typeof fetch;
}

/**
 * MAIL_MODE=resend (steps.md §10). Talks to Resend's HTTP API directly
 * rather than pulling in their SDK, to keep this dependency-free.
 *
 * Gotcha (steps.md §10): an unverified Resend account can only send to the
 * address that owns it — send everything to one teammate's inbox in dev,
 * or use `onboarding@resend.dev` as `from`.
 */
export class ResendMailTransport implements MailTransport {
  constructor(private readonly config: ResendConfig) {}

  async send(to: string, rendered: RenderedEmail): ReturnType<MailTransport["send"]> {
    const fetchFn = this.config.fetchImpl ?? fetch;
    try {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [to],
          subject: rendered.subject,
          html: rendered.html,
          attachments: rendered.attachments?.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content).toString("base64"),
          })),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, error: `Resend ${res.status}: ${text}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
