import { describe, test, expect } from "bun:test";
import { buildRecommendation, isColdStart } from "./recommend";

describe("buildRecommendation", () => {
  test("flags a shortage above 85% utilization", () => {
    const rec = buildRecommendation({
      equipmentType: "EXCAVATOR",
      weekStart: "2026-10-12",
      predictedWeeklyRentalDays: 92 * 7 * 0.01 * 10, // ~92% of a 10-unit fleet's capacity
      upperWeeklyRentalDays: 13 * 7,
      fleetSize: 10,
    });
    expect(rec.utilization).toBeGreaterThan(0.85);
    expect(rec.gapUnits).toBeGreaterThan(0);
    expect(rec.sentence).toContain("Short");
    expect(rec.sentence).toContain("EXCAVATOR");
  });

  test("flags a surplus below 35% utilization", () => {
    const rec = buildRecommendation({
      equipmentType: "GRADER",
      weekStart: "2026-11-02",
      predictedWeeklyRentalDays: 0.28 * 7 * 5,
      upperWeeklyRentalDays: 0.3 * 7 * 5,
      fleetSize: 5,
    });
    expect(rec.utilization).toBeLessThan(0.35);
    expect(rec.sentence).toContain("idle");
    expect(rec.sentence).toContain("promotional");
  });

  test("healthy utilization gets a plain status sentence, no shortage/surplus language", () => {
    const rec = buildRecommendation({
      equipmentType: "CRANE",
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 0.6 * 7 * 4,
      upperWeeklyRentalDays: 0.65 * 7 * 4,
      fleetSize: 4,
    });
    expect(rec.sentence).not.toContain("Short");
    expect(rec.sentence).not.toContain("idle");
  });

  test("zero fleet size does not divide by zero", () => {
    const rec = buildRecommendation({
      equipmentType: "FORKLIFT",
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 10,
      upperWeeklyRentalDays: 15,
      fleetSize: 0,
    });
    expect(Number.isFinite(rec.utilization)).toBe(true);
  });
});

describe("isColdStart", () => {
  test("under 60 days is cold start", () => {
    expect(isColdStart(45)).toBe(true);
  });
  test("60+ days is not", () => {
    expect(isColdStart(60)).toBe(false);
    expect(isColdStart(90)).toBe(false);
  });
});
