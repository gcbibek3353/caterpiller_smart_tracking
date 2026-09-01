import { describe, test, expect } from "bun:test";
import { createMailTransport } from "./factory";
import { ConsoleMailTransport } from "./console";
import { ResendMailTransport } from "./resend";

describe("createMailTransport", () => {
  test("console mode returns a ConsoleMailTransport", () => {
    const t = createMailTransport({ mailMode: "console", mailFrom: "alerts@rental.local" });
    expect(t).toBeInstanceOf(ConsoleMailTransport);
  });

  test("resend mode returns a ResendMailTransport when a key is present", () => {
    const t = createMailTransport({
      mailMode: "resend",
      mailFrom: "alerts@rental.local",
      resendApiKey: "re_test_key",
    });
    expect(t).toBeInstanceOf(ResendMailTransport);
  });

  test("resend mode without a key throws rather than silently falling back", () => {
    expect(() => createMailTransport({ mailMode: "resend", mailFrom: "alerts@rental.local" })).toThrow(
      /RESEND_API_KEY/,
    );
  });
});
