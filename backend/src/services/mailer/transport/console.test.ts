import { describe, test, expect } from "bun:test";
import { ConsoleMailTransport } from "./console";

const SCRATCH_MAIL_DIR = "/tmp/claude-1000/-home-krishal-hakathon/5378863d-4166-443a-9929-1ae38cb7fb79/scratchpad/mail-test";

describe("ConsoleMailTransport", () => {
  test("writes the rendered HTML to a file under mailDir and reports ok", async () => {
    const transport = new ConsoleMailTransport(SCRATCH_MAIL_DIR);
    const result = await transport.send("client@example.com", {
      subject: "Booking confirmed — EXC-0007",
      html: "<p>hello</p>",
    });
    expect(result.ok).toBe(true);

    const files = await Array.fromAsync(new Bun.Glob("*.html").scan({ cwd: SCRATCH_MAIL_DIR }));
    expect(files.length).toBeGreaterThan(0);
    const latest = files.sort().at(-1)!;
    const content = await Bun.file(`${SCRATCH_MAIL_DIR}/${latest}`).text();
    expect(content).toBe("<p>hello</p>");
  });

  test("sanitizes the subject into a safe filename", async () => {
    const transport = new ConsoleMailTransport(SCRATCH_MAIL_DIR);
    const result = await transport.send("client@example.com", {
      subject: "[HIGH] GEOFENCE_BREACH — EXC-0007",
      html: "<p>alert</p>",
    });
    expect(result.ok).toBe(true);
  });
});
