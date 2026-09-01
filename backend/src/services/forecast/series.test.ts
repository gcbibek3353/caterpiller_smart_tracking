import { describe, test, expect } from "bun:test";
import { buildDemandSeries, startOfWeekMonday, toISODate, toWeekly } from "./series";
import type { BookingLike } from "./types";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

describe("buildDemandSeries", () => {
  test("counts a single booking on the days it overlaps", () => {
    const bookings: BookingLike[] = [
      { equipmentType: "EXCAVATOR", startDate: d("2026-01-02"), endDate: d("2026-01-04"), status: "RETURNED" },
    ];
    const series = buildDemandSeries(bookings, "EXCAVATOR", d("2026-01-01"), d("2026-01-05"));
    // Jan 1: 0, Jan 2-4: 1, Jan 5: 0
    expect(series).toEqual([0, 1, 1, 1, 0]);
  });

  test("excludes CANCELLED bookings", () => {
    const bookings: BookingLike[] = [
      { equipmentType: "EXCAVATOR", startDate: d("2026-01-01"), endDate: d("2026-01-03"), status: "CANCELLED" },
    ];
    const series = buildDemandSeries(bookings, "EXCAVATOR", d("2026-01-01"), d("2026-01-03"));
    expect(series).toEqual([0, 0, 0]);
  });

  test("excludes other equipment types", () => {
    const bookings: BookingLike[] = [
      { equipmentType: "CRANE", startDate: d("2026-01-01"), endDate: d("2026-01-03"), status: "RETURNED" },
    ];
    const series = buildDemandSeries(bookings, "EXCAVATOR", d("2026-01-01"), d("2026-01-03"));
    expect(series).toEqual([0, 0, 0]);
  });

  test("stacks overlapping bookings of the same type", () => {
    const bookings: BookingLike[] = [
      { equipmentType: "EXCAVATOR", startDate: d("2026-01-01"), endDate: d("2026-01-03"), status: "CHECKED_OUT" },
      { equipmentType: "EXCAVATOR", startDate: d("2026-01-02"), endDate: d("2026-01-04"), status: "CONFIRMED" },
    ];
    const series = buildDemandSeries(bookings, "EXCAVATOR", d("2026-01-01"), d("2026-01-04"));
    expect(series).toEqual([1, 2, 2, 1]);
  });
});

describe("toWeekly", () => {
  test("sums 7-day chunks and drops a trailing partial week", () => {
    const daily = [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 5, 5];
    expect(toWeekly(daily)).toEqual([7, 14]);
  });
});

describe("startOfWeekMonday", () => {
  test("a Thursday rolls back to that week's Monday", () => {
    // 2026-01-01 is a Thursday
    expect(toISODate(startOfWeekMonday(d("2026-01-01")))).toBe("2025-12-29");
  });

  test("a Monday is its own start of week", () => {
    // 2026-01-05 is a Monday
    expect(toISODate(startOfWeekMonday(d("2026-01-05")))).toBe("2026-01-05");
  });

  test("a Sunday rolls back to the Monday 6 days earlier", () => {
    // 2026-01-04 is a Sunday
    expect(toISODate(startOfWeekMonday(d("2026-01-04")))).toBe("2025-12-29");
  });
});
