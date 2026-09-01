import { describe, test, expect } from "bun:test";
import { buildRecommendation, isColdStart } from "./recommend";

describe("buildRecommendation", () => {
  test("flags a shortage above 85% utilization", () => {
    const rec = buildRecommendation({
      equipmentType: "EXCAVATOR",
      siteId: null,
      weekStart: "2026-10-12",
      predictedWeeklyRentalDays: 92 * 7 * 0.01 * 10, // ~92% of a 10-unit fleet's capacity
      upperWeeklyRentalDays: 13 * 7,
      fleetSize: 10,
    });
    expect(rec.utilization).toBeGreaterThan(0.85);
    expect(rec.gapUnits).toBeGreaterThan(0);
    expect(rec.sentence).toContain("additional unit");
    expect(rec.sentence).toContain("EXCAVATOR");
    expect(rec.sentence).toContain("Company-wide");
  });

  test("flags a surplus below 35% utilization", () => {
    const rec = buildRecommendation({
      equipmentType: "GRADER",
      siteId: null,
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
      siteId: null,
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 0.6 * 7 * 4,
      upperWeeklyRentalDays: 0.65 * 7 * 4,
      fleetSize: 4,
    });
    expect(rec.sentence).not.toContain("additional unit");
    expect(rec.sentence).not.toContain("idle");
  });

  test("zero fleet size does not divide by zero", () => {
    const rec = buildRecommendation({
      equipmentType: "FORKLIFT",
      siteId: null,
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 10,
      upperWeeklyRentalDays: 15,
      fleetSize: 0,
    });
    expect(Number.isFinite(rec.utilization)).toBe(true);
  });

  test("a real siteId with a label reads as \"SITE A: ...\", matching the spec's example sentence shape", () => {
    const rec = buildRecommendation({
      equipmentType: "EXCAVATOR",
      siteId: "site-a",
      siteLabel: "SITE A",
      weekStart: "2026-10-12",
      predictedWeeklyRentalDays: 8 * 7, // 8 units/day average that week
      upperWeeklyRentalDays: 9 * 7,
      fleetSize: 5,
    });
    expect(rec.sentence.startsWith("SITE A:")).toBe(true);
    expect(rec.sentence).toContain("Current fleet is 5");
    expect(rec.siteId).toBe("site-a");
  });

  test("a real siteId without a label falls back to \"This site\", not a blank/undefined label", () => {
    const rec = buildRecommendation({
      equipmentType: "CRANE",
      siteId: "site-b",
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 0.6 * 7 * 4,
      upperWeeklyRentalDays: 0.65 * 7 * 4,
      fleetSize: 4,
    });
    expect(rec.sentence.startsWith("This site:")).toBe(true);
  });

  test("siteId: null reads as company-wide even with no explicit label", () => {
    const rec = buildRecommendation({
      equipmentType: "LOADER",
      siteId: null,
      weekStart: "2026-09-07",
      predictedWeeklyRentalDays: 0.6 * 7 * 4,
      upperWeeklyRentalDays: 0.65 * 7 * 4,
      fleetSize: 4,
    });
    expect(rec.sentence.startsWith("Company-wide:")).toBe(true);
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
