import { describe, test, expect } from "bun:test";
import {
  detectGeofenceBreach,
  detectNightMovement,
  detectImplausibleSpeed,
  detectPositionJump,
  detectFuelDrop,
  detectOverheat,
  detectTelemetryGap,
} from "./realtime";
import type { SiteLike, TelemetryLike } from "./types";

const site: SiteLike = { id: "site1", lat: 27.7, lng: 85.3, radiusMeters: 500 };

function tick(isoTime: string, overrides: Partial<TelemetryLike> = {}): TelemetryLike {
  return {
    equipmentId: "eq1",
    bookingId: "bk1",
    ts: new Date(isoTime),
    lat: 27.7,
    lng: 85.3,
    engineState: "WORKING",
    fuelPct: 80,
    engineTempC: 80,
    speedKph: 1,
    ...overrides,
  };
}

describe("detectGeofenceBreach", () => {
  test("does not flag inside the geofence", () => {
    const ticks = [tick("2026-01-01T10:00:00")];
    expect(detectGeofenceBreach(ticks, site)).toHaveLength(0);
  });

  test("does not flag 1-2 ticks outside (needs >2 consecutive)", () => {
    const ticks = [tick("2026-01-01T10:00:00", { lat: 28.5 }), tick("2026-01-01T10:10:00", { lat: 28.5 })];
    expect(detectGeofenceBreach(ticks, site)).toHaveLength(0);
  });

  test("flags at the 3rd consecutive tick outside", () => {
    const far = { lat: 28.5 };
    const ticks = [
      tick("2026-01-01T10:00:00", far),
      tick("2026-01-01T10:10:00", far),
      tick("2026-01-01T10:20:00", far),
    ];
    const out = detectGeofenceBreach(ticks, site);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("HIGH");
  });
});

describe("detectNightMovement", () => {
  test("flags movement at 2am", () => {
    const out = detectNightMovement([tick("2026-01-01T02:00:00", { speedKph: 10 })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("HIGH");
  });

  test("does not flag movement at 2pm", () => {
    expect(detectNightMovement([tick("2026-01-01T14:00:00", { speedKph: 10 })])).toHaveLength(0);
  });

  test("does not flag near-zero speed at night", () => {
    expect(detectNightMovement([tick("2026-01-01T02:00:00", { speedKph: 1 })])).toHaveLength(0);
  });
});

describe("detectImplausibleSpeed", () => {
  test("flags a tracked machine going 70kph", () => {
    const out = detectImplausibleSpeed([tick("2026-01-01T02:00:00", { speedKph: 70 })]);
    expect(out).toHaveLength(1);
  });

  test("does not flag normal crawl speed", () => {
    expect(detectImplausibleSpeed([tick("2026-01-01T10:00:00", { speedKph: 3 })])).toHaveLength(0);
  });
});

describe("detectPositionJump", () => {
  test("flags a 40km teleport between consecutive ticks (theft scenario)", () => {
    const ticks = [
      tick("2026-01-01T02:00:00", { lat: 27.7, lng: 85.3 }),
      tick("2026-01-01T02:10:00", { lat: 28.0, lng: 85.6 }), // ~40km away
    ];
    const out = detectPositionJump(ticks);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("HIGH");
  });

  test("does not flag normal within-site movement", () => {
    const ticks = [
      tick("2026-01-01T10:00:00", { lat: 27.7, lng: 85.3 }),
      tick("2026-01-01T10:10:00", { lat: 27.7001, lng: 85.3001 }),
    ];
    expect(detectPositionJump(ticks)).toHaveLength(0);
  });
});

describe("detectFuelDrop", () => {
  test("flags a 35-point drop with engine OFF (siphon scenario)", () => {
    const ticks = [
      tick("2026-01-01T02:00:00", { fuelPct: 80, engineState: "OFF" }),
      tick("2026-01-01T02:10:00", { fuelPct: 45, engineState: "OFF" }),
    ];
    const out = detectFuelDrop(ticks);
    expect(out).toHaveLength(1);
  });

  test("does not flag a fuel drop while the engine is WORKING (normal burn)", () => {
    const ticks = [
      tick("2026-01-01T10:00:00", { fuelPct: 80, engineState: "WORKING" }),
      tick("2026-01-01T10:10:00", { fuelPct: 60, engineState: "WORKING" }),
    ];
    expect(detectFuelDrop(ticks)).toHaveLength(0);
  });

  test("does not flag a small drop while OFF", () => {
    const ticks = [
      tick("2026-01-01T10:00:00", { fuelPct: 80, engineState: "OFF" }),
      tick("2026-01-01T10:10:00", { fuelPct: 78, engineState: "OFF" }),
    ];
    expect(detectFuelDrop(ticks)).toHaveLength(0);
  });
});

describe("detectOverheat", () => {
  test("flags 3 consecutive ticks above 105C", () => {
    const ticks = [
      tick("2026-01-01T10:00:00", { engineTempC: 108 }),
      tick("2026-01-01T10:10:00", { engineTempC: 110 }),
      tick("2026-01-01T10:20:00", { engineTempC: 112 }),
    ];
    const out = detectOverheat(ticks);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("HIGH");
  });

  test("does not flag a single hot tick", () => {
    expect(detectOverheat([tick("2026-01-01T10:00:00", { engineTempC: 108 })])).toHaveLength(0);
  });

  test("resets the streak on a cool tick", () => {
    const ticks = [
      tick("2026-01-01T10:00:00", { engineTempC: 108 }),
      tick("2026-01-01T10:10:00", { engineTempC: 90 }),
      tick("2026-01-01T10:20:00", { engineTempC: 108 }),
      tick("2026-01-01T10:30:00", { engineTempC: 108 }),
    ];
    expect(detectOverheat(ticks)).toHaveLength(0);
  });
});

describe("detectTelemetryGap", () => {
  test("flags a gap over 60 minutes between ticks", () => {
    const ticks = [tick("2026-01-01T10:00:00"), tick("2026-01-01T11:30:00")];
    const out = detectTelemetryGap(ticks);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("MEDIUM");
  });

  test("does not flag normal 10-min cadence", () => {
    const ticks = [tick("2026-01-01T10:00:00"), tick("2026-01-01T10:10:00")];
    expect(detectTelemetryGap(ticks)).toHaveLength(0);
  });

  test("flags an ongoing gap up to `now` when the feed just stopped", () => {
    const ticks = [tick("2026-01-01T10:00:00")];
    const now = new Date("2026-01-01T11:30:00");
    const out = detectTelemetryGap(ticks, now);
    expect(out).toHaveLength(1);
  });
});
