import type { MailTransport, RenderedEmail } from "../types";

/**
 * MAIL_MODE=console (steps.md §10): writes the full rendered email to
 * stdout and appends it to `<mailDir>/*.html` so it can be opened in a
 * browser. Every dev works in this mode by default.
 */
export class ConsoleMailTransport implements MailTransport {
  constructor(private readonly mailDir: string) {}

  async send(to: string, rendered: RenderedEmail): ReturnType<MailTransport["send"]> {
    try {
      await Bun.$`mkdir -p ${this.mailDir}`.quiet();
      const safeSubject = rendered.subject.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
      const filePath = `${this.mailDir}/${Date.now()}-${safeSubject}.html`;
      await Bun.write(filePath, rendered.html);
      console.log(`[mail:console] to=${to} subject="${rendered.subject}" -> ${filePath}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
