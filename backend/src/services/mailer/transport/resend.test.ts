import { describe, test, expect } from "bun:test";
import { ResendMailTransport } from "./resend";

// These tests never hit the real Resend API — `fetchImpl` is always a mock.

describe("ResendMailTransport", () => {
  test("posts the right payload shape and returns ok on 2xx", async () => {
    let capturedUrl = "";
    let capturedBody: any = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
    }) as typeof fetch;

    const transport = new ResendMailTransport({ apiKey: "test-key", from: "alerts@rental.local", fetchImpl });
    const result = await transport.send("client@example.com", { subject: "Hi", html: "<p>Hi</p>" });

    expect(result.ok).toBe(true);
    expect(capturedUrl).toBe("https://api.resend.com/emails");
    expect(capturedBody.to).toEqual(["client@example.com"]);
    expect(capturedBody.from).toBe("alerts@rental.local");
    expect(capturedBody.subject).toBe("Hi");
  });

  test("base64-encodes attachments", async () => {
    let capturedBody: any = null;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const transport = new ResendMailTransport({ apiKey: "k", from: "f@x.com", fetchImpl });
    await transport.send("to@x.com", {
      subject: "s",
      html: "h",
      attachments: [{ filename: "qr.png", content: new Uint8Array([1, 2, 3]) }],
    });

    expect(capturedBody.attachments[0].filename).toBe("qr.png");
    expect(capturedBody.attachments[0].content).toBe(Buffer.from([1, 2, 3]).toString("base64"));
  });

  test("returns ok:false with the response body on a non-2xx", async () => {
    const fetchImpl = (async () => new Response("bad request", { status: 400 })) as unknown as typeof fetch;
    const transport = new ResendMailTransport({ apiKey: "k", from: "f@x.com", fetchImpl });
    const result = await transport.send("to@x.com", { subject: "s", html: "h" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("400");
  });

  test("returns ok:false when the network call throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const transport = new ResendMailTransport({ apiKey: "k", from: "f@x.com", fetchImpl });
    const result = await transport.send("to@x.com", { subject: "s", html: "h" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network down");
  });
});
