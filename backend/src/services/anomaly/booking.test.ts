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
  // endDate is the last rental day, inclusive — due back is end of that day
  // (endDate + graceDays), not the instant endDate ticks over to midnight.

  test("does not flag on the end date itself — the client still has that whole day", () => {
    const out = detectOverdue(booking(), new Date("2026-01-10T18:00:00"));
    expect(out).toHaveLength(0);
  });

  test("does not flag right at the endDate/dueBy boundary (00:00 the day after)", () => {
    const out = detectOverdue(booking(), new Date("2026-01-11T00:00:00"));
    expect(out).toHaveLength(0);
  });

  test("flags MEDIUM shortly after the grace day ends", () => {
    const out = detectOverdue(booking(), new Date("2026-01-11T02:00:00"));
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
    expect(out[0]!.value).toBeCloseTo(2, 5); // 2h past the real dueBy, not 26h past endDate
  });

  test("escalates to HIGH after 48h past the real dueBy", () => {
    const out = detectOverdue(booking(), new Date("2026-01-13T01:00:00"));
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
