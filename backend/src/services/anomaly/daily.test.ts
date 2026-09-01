import { describe, test, expect } from "bun:test";
import {
  detectHighIdle,
  detectZeroRuntime,
  detectMissingOperator,
  detectUnassignedSite,
  detectLowUtilization,
  detectFuelEfficiencyDrift,
} from "./daily";
import type { DailyUsageLike } from "./types";

function day(iso: string, overrides: Partial<DailyUsageLike> = {}): DailyUsageLike {
  return {
    equipmentId: "eq1",
    bookingId: "bk1",
    date: new Date(iso + "T00:00:00"),
    engineHours: 8,
    workingHours: 6,
    idleHours: 2,
    idleRatio: 0.25,
    isOperatingDay: true,
    fuelUsedPct: 10,
    fuelPerHour: 1,
    hasOperator: true,
    bookingStatus: "CHECKED_OUT",
    siteId: "site1",
    ...overrides,
  };
}

describe("detectHighIdle", () => {
  test("flags MEDIUM over the ratio+hours threshold", () => {
    const out = detectHighIdle([day("2026-01-01", { idleRatio: 0.6, idleHours: 4 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
    expect(out[0]!.dedupeKey).toBe("HIGH_IDLE:eq1:2026-01-01");
  });

  test("escalates to HIGH above the high-idle ratio", () => {
    const out = detectHighIdle([day("2026-01-01", { idleRatio: 0.8, idleHours: 5 })]);
    expect(out[0]!.severity).toBe("HIGH");
  });

  test("does not flag when idle hours are under the floor even if ratio is high", () => {
    const out = detectHighIdle([day("2026-01-01", { idleRatio: 0.9, idleHours: 1 })]);
    expect(out).toHaveLength(0);
  });

  test("does not flag normal usage", () => {
    const out = detectHighIdle([day("2026-01-01", { idleRatio: 0.2, idleHours: 1 })]);
    expect(out).toHaveLength(0);
  });
});

describe("detectZeroRuntime", () => {
  test("does not flag a single zero day", () => {
    const rows = [day("2026-01-01", { engineHours: 0 })];
    expect(detectZeroRuntime(rows)).toHaveLength(0);
  });

  test("flags MEDIUM at 2 consecutive zero days, one candidate per day past the threshold", () => {
    const rows = [
      day("2026-01-01", { engineHours: 0 }),
      day("2026-01-02", { engineHours: 0 }),
      day("2026-01-03", { engineHours: 0 }),
    ];
    const out = detectZeroRuntime(rows);
    expect(out).toHaveLength(2); // day 2 and day 3
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("escalates to HIGH at 4 consecutive days", () => {
    const rows = [1, 2, 3, 4].map((d) => day(`2026-01-0${d}`, { engineHours: 0 }));
    const out = detectZeroRuntime(rows);
    const last = out[out.length - 1]!;
    expect(last.severity).toBe("HIGH");
  });

  test("resets the streak once engine hours resume", () => {
    const rows = [
      day("2026-01-01", { engineHours: 0 }),
      day("2026-01-02", { engineHours: 0 }),
      day("2026-01-03", { engineHours: 5 }),
      day("2026-01-04", { engineHours: 0 }),
    ];
    expect(detectZeroRuntime(rows)).toHaveLength(1); // only 2026-01-02
  });

  test("ignores zero-runtime days when not CHECKED_OUT", () => {
    const rows = [
      day("2026-01-01", { engineHours: 0, bookingStatus: "RETURNED" }),
      day("2026-01-02", { engineHours: 0, bookingStatus: "RETURNED" }),
    ];
    expect(detectZeroRuntime(rows)).toHaveLength(0);
  });
});

describe("detectMissingOperator", () => {
  test("flags engine hours with no operator", () => {
    const out = detectMissingOperator([day("2026-01-01", { hasOperator: false, engineHours: 4 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("does not flag zero-hour days even without an operator", () => {
    const out = detectMissingOperator([day("2026-01-01", { hasOperator: false, engineHours: 0 })]);
    expect(out).toHaveLength(0);
  });

  test("does not flag when an operator is on record", () => {
    const out = detectMissingOperator([day("2026-01-01", { hasOperator: true, engineHours: 4 })]);
    expect(out).toHaveLength(0);
  });
});

describe("detectUnassignedSite", () => {
  test("does not flag within the first 24h", () => {
    const out = detectUnassignedSite([day("2026-01-01", { siteId: null })]);
    expect(out).toHaveLength(0);
  });

  test("flags LOW past 24h", () => {
    const rows = [
      day("2026-01-01", { siteId: null }),
      day("2026-01-02", { siteId: null }),
    ];
    const out = detectUnassignedSite(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("LOW");
  });

  test("escalates to MEDIUM past 48h", () => {
    const rows = [
      day("2026-01-01", { siteId: null }),
      day("2026-01-02", { siteId: null }),
      day("2026-01-03", { siteId: null }),
    ];
    const out = detectUnassignedSite(rows);
    expect(out[out.length - 1]!.severity).toBe("MEDIUM");
  });
});

describe("detectLowUtilization", () => {
  test("flags 3+ low-hour weekdays in the trailing 5 days", () => {
    // Mon..Fri 2026-01-05..09, all under 2h
    const rows = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map((d) =>
      day(d, { engineHours: 1 }),
    );
    const out = detectLowUtilization(rows);
    expect(out.length).toBeGreaterThan(0);
    expect(out[out.length - 1]!.severity).toBe("LOW");
  });

  test("does not flag a normal working week", () => {
    const rows = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09"].map((d) =>
      day(d, { engineHours: 8 }),
    );
    expect(detectLowUtilization(rows)).toHaveLength(0);
  });

  test("weekend low hours don't count toward the weekday threshold", () => {
    // Sat/Sun low, only 2 weekdays low — under the 3-day minimum
    const rows = [
      day("2026-01-03", { engineHours: 0 }), // Sat
      day("2026-01-04", { engineHours: 0 }), // Sun
      day("2026-01-05", { engineHours: 1 }), // Mon
      day("2026-01-06", { engineHours: 1 }), // Tue
      day("2026-01-07", { engineHours: 8 }), // Wed
    ];
    expect(detectLowUtilization(rows)).toHaveLength(0);
  });
});

describe("detectFuelEfficiencyDrift", () => {
  test("does not flag with insufficient trailing history", () => {
    const rows = [day("2026-01-01", { fuelPerHour: 5 })];
    expect(detectFuelEfficiencyDrift(rows)).toHaveLength(0);
  });

  test("flags a spike above 1.4x the trailing median", () => {
    const trailing = Array.from({ length: 10 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, { fuelPerHour: 2 }));
    const spike = day("2026-01-11", { fuelPerHour: 3.5 }); // 1.75x
    const out = detectFuelEfficiencyDrift([...trailing, spike]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("does not flag normal fluctuation under the multiplier", () => {
    const trailing = Array.from({ length: 10 }, (_, i) => day(`2026-01-${String(i + 1).padStart(2, "0")}`, { fuelPerHour: 2 }));
    const normal = day("2026-01-11", { fuelPerHour: 2.3 }); // 1.15x
    expect(detectFuelEfficiencyDrift([...trailing, normal])).toHaveLength(0);
  });
});
