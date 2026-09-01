import { describe, test, expect } from "bun:test";
import { partitionBySeverity, shouldSendDigestNow } from "./digest";

describe("partitionBySeverity", () => {
  test("HIGH goes immediate, MEDIUM goes digestible, LOW goes nowhere", () => {
    const items = [{ severity: "HIGH" as const }, { severity: "MEDIUM" as const }, { severity: "LOW" as const }];
    const { immediate, digestible } = partitionBySeverity(items);
    expect(immediate).toHaveLength(1);
    expect(digestible).toHaveLength(1);
  });
});

describe("shouldSendDigestNow", () => {
  test("true when nothing has ever been sent", () => {
    expect(shouldSendDigestNow(null, new Date())).toBe(true);
  });

  test("false within the rate-limit window", () => {
    const last = new Date("2026-09-01T10:00:00");
    const now = new Date("2026-09-01T10:30:00");
    expect(shouldSendDigestNow(last, now, 60)).toBe(false);
  });

  test("true once the interval has elapsed", () => {
    const last = new Date("2026-09-01T10:00:00");
    const now = new Date("2026-09-01T11:00:00");
    expect(shouldSendDigestNow(last, now, 60)).toBe(true);
  });
});
