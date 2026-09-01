import type { EquipmentType } from "@prisma/client";

/**
 * Every tunable in the seed lives here. When the forecast chart looks flat or
 * the fleet looks idle at H20, you change numbers in THIS file — you do not go
 * hunting through the generators.
 */

export const SEED = 0x5eed_1234; // fixed → every run produces identical data

/** History window. 12 months back, plus a month forward for upcoming bookings. */
export const HISTORY_DAYS = 365;
export const FUTURE_DAYS = 28;

/** Raw 10-minute ticks only for the recent window — the rest would be ~2M rows. */
export const TELEMETRY_DAYS = 21;
export const TICK_MINUTES = 10;

/**
 * Deliberately lopsided fleet. An even fleet makes every type's shortage/surplus
 * look the same, which makes the forecast output boring.
 */
export const FLEET: Record<string, { type: EquipmentType; count: number; prefix: string; dailyRate: [number, number]; fuelCapacityL: number }> = {
  excavator:  { type: "EXCAVATOR",  count: 12, prefix: "EXC", dailyRate: [380, 620], fuelCapacityL: 400 },
  loader:     { type: "LOADER",     count:  8, prefix: "LDR", dailyRate: [300, 480], fuelCapacityL: 300 },
  bulldozer:  { type: "BULLDOZER",  count:  6, prefix: "BLD", dailyRate: [520, 850], fuelCapacityL: 500 },
  grader:     { type: "GRADER",     count:  5, prefix: "GRD", dailyRate: [420, 640], fuelCapacityL: 350 },
  crane:      { type: "CRANE",      count:  4, prefix: "CRN", dailyRate: [900, 1500], fuelCapacityL: 600 },
  dumpTruck:  { type: "DUMP_TRUCK", count:  3, prefix: "DMP", dailyRate: [260, 400], fuelCapacityL: 300 },
  forklift:   { type: "FORKLIFT",   count:  2, prefix: "FRK", dailyRate: [140, 220], fuelCapacityL: 120 },
};

export const FLEET_SIZE = Object.values(FLEET).reduce((n, f) => n + f.count, 0); // 40

/** Arrivals per day per machine of that type, before any seasonal multiplier. */
export const BASE_ARRIVAL_RATE = 0.045;

/** Demand grows 15% across the year — gives the forecaster a trend to find. */
export const ANNUAL_TREND = 0.15;

/** Amplitude of the yearly construction cycle, peaking in the dry season. */
export const ANNUAL_AMPLITUDE = 0.3;
export const ANNUAL_PEAK_DOY = 330; // late November

/** Monsoon trough: ~8 weeks at 60% of normal demand. */
export const MONSOON = { fromDoy: 166, toDoy: 222, multiplier: 0.6 };

/** Weekend starts are rare; Monday is the busiest start day. Index 0 = Sunday. */
export const WEEKDAY_WEIGHT = [0.15, 1.65, 1.3, 1.2, 1.05, 0.85, 0.25];

/** Road season lifts graders specifically — a type-mix shift, not just a level shift. */
export const ROAD_SEASON = { fromDoy: 274, toDoy: 365, type: "GRADER" as EquipmentType, multiplier: 1.8 };

/** Multiplicative noise, as a lognormal sigma. ~±20%. */
export const NOISE_SIGMA = 0.18;

/** One-off "big project" spikes: N windows of ~10 days at 2.2x. */
export const SPIKE_COUNT = 4;
export const SPIKE_LENGTH_DAYS = 10;
export const SPIKE_MULTIPLIER = 2.2;

/** Rental duration mixture. Mean lands near 12 days. */
export const DURATION_MIX = [
  { weight: 0.55, min: 3,  max: 10 },
  { weight: 0.35, min: 10, max: 21 },
  { weight: 0.10, min: 21, max: 45 },
];

/** Share of finished rentals returned after the agreed end date. */
export const LATE_RETURN_RATE = 0.08;

export const CLIENTS = [
  { email: "client@build.com",   name: "Ramesh Shrestha", company: "BuildWell Constructions", phone: "+977-9801000001" },
  { email: "ops@himalayan.com",  name: "Sunita Gurung",   company: "Himalayan Infra",         phone: "+977-9801000002" },
  { email: "pm@valleyworks.com", name: "Dipesh Karki",    company: "Valley Works Pvt Ltd",    phone: "+977-9801000003" },
  { email: "site@nepcon.com",    name: "Anita Tamang",    company: "NepCon Engineering",      phone: "+977-9801000004" },
  { email: "hire@everestbg.com", name: "Bikash Rai",      company: "Everest Building Group",  phone: "+977-9801000005" },
];

export const ADMIN = { email: "admin@rental.com", name: "Rental Store Admin", password: "admin123" };
export const CLIENT_PASSWORD = "client123";

/** Depot + a city to scatter sites around (Kathmandu valley). */
export const DEPOT = { lat: 27.7172, lng: 85.324 };
export const CITY_SPREAD = 0.12; // ~13 km

/** Duty cycle by hour, weekday. Probabilities for [WORKING, IDLE, OFF]. */
export const DUTY_WORK_HOURS = { start: 7, end: 17, working: 0.65, idle: 0.3 };
export const DUTY_OFF_HOURS = { idle: 0.05 };
export const SUNDAY_OFF_PROBABILITY = 0.9;

/** Fuel burn %/tick, temperature targets. */
export const FUEL_BURN = { working: [1.4, 0.3], idle: [0.4, 0.1] } as const;
export const REFUEL_BELOW_PCT = 12;
export const TEMP = { workingTarget: 88, workingSd: 6, cap: 95, ambient: 22 };

/**
 * Machines given a deliberate fault in the recent window, so D's detectors find
 * REAL anomalies rather than fixture rows. Keyed by fleet index within a type.
 */
export const INJECTED_FAULTS = [
  { kind: "high_idle",  type: "EXCAVATOR" as EquipmentType, nth: 0, days: 4 },
  { kind: "zero_runtime", type: "LOADER"  as EquipmentType, nth: 0, days: 3 },
  { kind: "overheat",   type: "BULLDOZER" as EquipmentType, nth: 0, days: 2 },
  { kind: "fuel_drop",  type: "CRANE"     as EquipmentType, nth: 0, days: 2 },
] as const;
