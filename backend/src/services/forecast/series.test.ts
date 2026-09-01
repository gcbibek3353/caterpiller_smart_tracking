import { describe, test, expect } from "bun:test";
import { buildDemandSeries, buildSiteContext, startOfWeekMonday, toISODate, toWeekly } from "./series";
import type { BookingLike } from "./types";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

function booking(overrides: Partial<BookingLike> = {}): BookingLike {
  return {
    equipmentType: "EXCAVATOR",
    siteId: null,
    startDate: d("2026-01-01"),
    endDate: d("2026-01-01"),
    status: "RETURNED",
    ...overrides,
  };
}

describe("buildDemandSeries", () => {
  test("counts a single booking on the days it overlaps", () => {
    const bookings: BookingLike[] = [
      booking({ startDate: d("2026-01-02"), endDate: d("2026-01-04") }),
    ];
    const series = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-05"));
    // Jan 1: 0, Jan 2-4: 1, Jan 5: 0
    expect(series).toEqual([0, 1, 1, 1, 0]);
  });

  test("excludes CANCELLED bookings", () => {
    const bookings: BookingLike[] = [
      booking({ startDate: d("2026-01-01"), endDate: d("2026-01-03"), status: "CANCELLED" }),
    ];
    const series = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-03"));
    expect(series).toEqual([0, 0, 0]);
  });

  test("excludes other equipment types", () => {
    const bookings: BookingLike[] = [
      booking({ equipmentType: "CRANE", startDate: d("2026-01-01"), endDate: d("2026-01-03") }),
    ];
    const series = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-03"));
    expect(series).toEqual([0, 0, 0]);
  });

  test("stacks overlapping bookings of the same type", () => {
    const bookings: BookingLike[] = [
      booking({ startDate: d("2026-01-01"), endDate: d("2026-01-03"), status: "CHECKED_OUT" }),
      booking({ startDate: d("2026-01-02"), endDate: d("2026-01-04"), status: "CONFIRMED" }),
    ];
    const series = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-04"));
    expect(series).toEqual([1, 2, 2, 1]);
  });

  test("a real siteId scopes to just that site", () => {
    const bookings: BookingLike[] = [
      booking({ siteId: "site-a", startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
      booking({ siteId: "site-b", startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
    ];
    const siteA = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: "site-a" }, d("2026-01-01"), d("2026-01-02"));
    expect(siteA).toEqual([1, 1]);
  });

  test("siteId: null pools every site (company-wide)", () => {
    const bookings: BookingLike[] = [
      booking({ siteId: "site-a", startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
      booking({ siteId: "site-b", startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
      booking({ siteId: null, startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
    ];
    const companyWide = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-02"));
    expect(companyWide).toEqual([3, 3]);
  });

  test("a booking with no site still counts toward company-wide, not toward any specific site", () => {
    const bookings: BookingLike[] = [booking({ siteId: null, startDate: d("2026-01-01"), endDate: d("2026-01-01") })];
    const siteA = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: "site-a" }, d("2026-01-01"), d("2026-01-01"));
    const companyWide = buildDemandSeries(bookings, { equipmentType: "EXCAVATOR", siteId: null }, d("2026-01-01"), d("2026-01-01"));
    expect(siteA).toEqual([0]);
    expect(companyWide).toEqual([1]);
  });
});

describe("buildSiteContext", () => {
  test("activeCount counts bookings of ANY equipment type at the site", () => {
    const bookings: BookingLike[] = [
      booking({ siteId: "site-a", equipmentType: "EXCAVATOR", startDate: d("2026-01-01"), endDate: d("2026-01-02") }),
      booking({ siteId: "site-a", equipmentType: "CRANE", startDate: d("2026-01-01"), endDate: d("2026-01-01") }),
    ];
    const { activeCount } = buildSiteContext(bookings, "site-a", d("2026-01-01"), d("2026-01-02"));
    expect(activeCount).toEqual([2, 1]);
  });

  test("avgDurationDays is the mean length of bookings active that day", () => {
    const bookings: BookingLike[] = [
      // 3-day booking (Jan 1-3) and a 1-day booking (Jan 2 only) overlap on Jan 2.
      booking({ siteId: "site-a", startDate: d("2026-01-01"), endDate: d("2026-01-03") }),
      booking({ siteId: "site-a", startDate: d("2026-01-02"), endDate: d("2026-01-02") }),
    ];
    const { avgDurationDays } = buildSiteContext(bookings, "site-a", d("2026-01-01"), d("2026-01-03"));
    expect(avgDurationDays).toEqual([3, 2, 3]); // Jan1: just the 3-day one; Jan2: (3+1)/2; Jan3: just the 3-day one
  });

  test("a day with no active bookings has avgDurationDays 0, not NaN", () => {
    const { avgDurationDays } = buildSiteContext([], "site-a", d("2026-01-01"), d("2026-01-01"));
    expect(avgDurationDays).toEqual([0]);
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
