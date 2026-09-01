import { describe, test, expect } from "bun:test";
import { buildPendingNotification, markSent, markFailed } from "./notification";

describe("buildPendingNotification", () => {
  test("starts PENDING with no sentAt/error", () => {
    const n = buildPendingNotification("user1", "OVERDUE", { subject: "s", html: "<p>h</p>" }, "OVERDUE:eq1:2026-09-01");
    expect(n.status).toBe("PENDING");
    expect(n.sentAt).toBeNull();
    expect(n.error).toBeNull();
    expect(n.dedupeKey).toBe("OVERDUE:eq1:2026-09-01");
  });
});

describe("markSent / markFailed", () => {
  test("markSent flips status and sets sentAt, clears error", () => {
    const pending = buildPendingNotification("u1", "OVERDUE", { subject: "s", html: "h" }, "k1");
    const failed = markFailed(pending, "smtp down");
    const sent = markSent(failed, new Date("2026-09-01T00:00:00"));
    expect(sent.status).toBe("SENT");
    expect(sent.error).toBeNull();
    expect(sent.sentAt).toEqual(new Date("2026-09-01T00:00:00"));
  });

  test("markFailed sets status and error, does not touch sentAt", () => {
    const pending = buildPendingNotification("u1", "OVERDUE", { subject: "s", html: "h" }, "k1");
    const failed = markFailed(pending, "smtp down");
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toBe("smtp down");
    expect(failed.sentAt).toBeNull();
  });

  test("does not mutate the original notification", () => {
    const pending = buildPendingNotification("u1", "OVERDUE", { subject: "s", html: "h" }, "k1");
    markSent(pending, new Date());
    expect(pending.status).toBe("PENDING");
  });
});
