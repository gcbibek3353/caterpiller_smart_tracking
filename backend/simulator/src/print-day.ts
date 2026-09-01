#!/usr/bin/env bun
/**
 * Print one simulated day to stdout for manual inspection.
 * Usage: bun run print-day [--scenario theft] [--seed 42]
 */
import { parseScenario } from "./scenarios";
import { simulateDay } from "./physics";

const args = process.argv.slice(2);
let scenario: ReturnType<typeof parseScenario>;
let seed = 42;
let equipmentId = "eq_demo_007";
let equipmentCode = "EQX1007";

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--scenario" && args[i + 1]) {
    scenario = parseScenario(args[++i]);
  } else if (args[i] === "--seed" && args[i + 1]) {
    seed = parseInt(args[++i], 10);
  } else if (args[i] === "--equipment" && args[i + 1]) {
    equipmentCode = args[++i];
    equipmentId = `eq_${equipmentCode.toLowerCase()}`;
  }
}

const site = {
  lat: 12.9716,
  lng: 77.5946,
  radiusMeters: 500,
};

const dayStart = new Date("2026-09-01T00:00:00.000Z");

const ticks = simulateDay(
  {
    equipmentId,
    equipmentCode,
    site,
    seed,
    scenario,
  },
  dayStart,
);

console.log(`\n=== Simulated day for ${equipmentCode} (${equipmentId}) ===`);
console.log(`Scenario: ${scenario ?? "normal"}`);
console.log(`Site: ${site.lat}, ${site.lng} (radius ${site.radiusMeters}m)`);
console.log(`Ticks: ${ticks.length}\n`);

for (const tick of ticks) {
  const time = new Date(tick.ts).toISOString().slice(11, 16);
  const dist = haversineKm(tick.lat, tick.lng, site.lat, site.lng);
  console.log(
    `${time} ${tick.engineState.padEnd(7)} fuel=${tick.fuelPct.toFixed(0).padStart(3)}% temp=${tick.engineTempC.toFixed(0).padStart(3)}°C speed=${tick.speedKph.toFixed(1)} km/h dist=${(dist * 1000).toFixed(0)}m hrs=${tick.engineHours.toFixed(2)}`,
  );
}

console.log("\n--- JSON sample (first 3 ticks) ---");
console.log(JSON.stringify(ticks.slice(0, 3), null, 2));

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
