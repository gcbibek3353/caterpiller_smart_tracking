import { describe, test, expect } from "bun:test";
import { detectOverdue, detectUpcomingReturn } from "./booking";
import type { BookingRuleInput } from "./types";

function booking(overrides: Partial<BookingRuleInput> = {}): BookingRuleInput {
  return {
    id: "bk1",
    equipmentId: "eq1",
    status: "CHECKED_OUT",
    endDate: new Date("2026-01-10T00:00:00"),
    ...overrides,
  };
}

describe("detectOverdue", () => {
  test("does not flag before the end date", () => {
    const out = detectOverdue(booking(), new Date("2026-01-09T00:00:00"));
    expect(out).toHaveLength(0);
  });

  test("flags MEDIUM shortly after the end date", () => {
    const out = detectOverdue(booking(), new Date("2026-01-10T02:00:00"));
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("escalates to HIGH after 48h overdue", () => {
    const out = detectOverdue(booking(), new Date("2026-01-12T01:00:00"));
    expect(out[0]!.severity).toBe("HIGH");
  });

  test("does not flag a booking that isn't CHECKED_OUT", () => {
    const out = detectOverdue(booking({ status: "RETURNED" }), new Date("2026-01-15T00:00:00"));
    expect(out).toHaveLength(0);
  });
});

describe("detectUpcomingReturn", () => {
  test("flags at 3 days out", () => {
    const out = detectUpcomingReturn(booking(), new Date("2026-01-07T00:00:00"));
    expect(out).toHaveLength(1);
    expect(out[0]!.threshold).toBe(3);
  });

  test("flags at 1 day out", () => {
    const out = detectUpcomingReturn(booking(), new Date("2026-01-09T00:00:00"));
    expect(out[0]!.threshold).toBe(1);
  });

  test("does not flag at 5 days out", () => {
    expect(detectUpcomingReturn(booking(), new Date("2026-01-05T00:00:00"))).toHaveLength(0);
  });

  test("is informational: severity is LOW, not escalating", () => {
    const out = detectUpcomingReturn(booking(), new Date("2026-01-09T00:00:00"));
    expect(out[0]!.severity).toBe("LOW");
  });
});
