#!/usr/bin/env bun
/**
 * Live telemetry simulator — reads CHECKED_OUT bookings and POSTs batches.
 * Usage: bun run src/index.ts [--scenario theft] [--once]
 */
import { parseScenario } from "./scenarios";
import { createInitialState, simulate, type ScenarioRuntime } from "./physics";
import type { TelemetryOutput } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const INGEST_API_KEY = process.env.INGEST_API_KEY ?? "sim-dev-key";
const SIM_SPEED = parseInt(process.env.SIM_SPEED ?? "60", 10);

const args = process.argv.slice(2);
const scenario = parseScenario(
  args.includes("--scenario") ? args[args.indexOf("--scenario") + 1] : undefined,
);
const runOnce = args.includes("--once");

interface CheckedOutBooking {
  bookingId: string;
  equipmentId: string;
  equipmentCode: string;
  site: { lat: number; lng: number; radiusMeters: number };
  operatorId?: string;
}

const equipmentStates = new Map<
  string,
  { state: ReturnType<typeof createInitialState>; scenarioRuntime: ScenarioRuntime }
>();

async function fetchCheckedOut(): Promise<CheckedOutBooking[]> {
  try {
    const res = await fetch(`${API_URL}/api/telemetry/active-bookings`, {
      headers: { "x-api-key": INGEST_API_KEY },
    });
    if (!res.ok) {
      console.warn(`Active bookings fetch failed (${res.status}), using demo equipment`);
      return getDemoBookings();
    }
    const json = (await res.json()) as { data: CheckedOutBooking[] };
    return json.data?.length ? json.data : getDemoBookings();
  } catch {
    console.warn("Backend unavailable, using demo equipment");
    return getDemoBookings();
  }
}

function getDemoBookings(): CheckedOutBooking[] {
  return [
    {
      bookingId: "bk_demo",
      equipmentId: "eq_demo_007",
      equipmentCode: "EQX1007",
      site: { lat: 12.9716, lng: 77.5946, radiusMeters: 500 },
    },
  ];
}

async function ingestBatch(ticks: TelemetryOutput[]) {
  if (ticks.length === 0) return;

  const res = await fetch(`${API_URL}/api/telemetry/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": INGEST_API_KEY,
    },
    body: JSON.stringify({ ticks }),
  });

  const json = (await res.json()) as { data?: { inserted?: number; skipped?: number } };
  if (!res.ok) {
    console.error("Ingest failed:", json);
    return;
  }
  console.log(
    `[${new Date().toISOString()}] Ingested ${json.data?.inserted ?? 0} ticks, skipped ${json.data?.skipped ?? 0}`,
  );
}

async function tick() {
  const bookings = await fetchCheckedOut();
  const batch: TelemetryOutput[] = [];

  for (const booking of bookings) {
    let entry = equipmentStates.get(booking.equipmentId);
    if (!entry) {
      entry = {
        state: createInitialState(
          {
            equipmentId: booking.equipmentId,
            equipmentCode: booking.equipmentCode,
            bookingId: booking.bookingId,
            site: booking.site,
            seed: hashString(booking.equipmentId),
            scenario,
          },
          new Date(),
        ),
        scenarioRuntime: { type: scenario },
      };
      if (scenario === "offline") {
        entry.scenarioRuntime.offlineUntil = new Date(Date.now() + 3 * 60 * 60_000);
      }
      equipmentStates.set(booking.equipmentId, entry);
    }

    const result = simulate(
      entry.state,
      {
        equipmentId: booking.equipmentId,
        equipmentCode: booking.equipmentCode,
        bookingId: booking.bookingId,
        site: booking.site,
        seed: hashString(booking.equipmentId),
        scenario,
      },
      entry.scenarioRuntime,
    );

    entry.state = result.state as typeof entry.state;
    if (result.tick) {
      batch.push({
        ...result.tick,
        bookingId: booking.bookingId,
      });
    }
  }

  await ingestBatch(batch);
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

const intervalMs = Math.max(100, (10_000 / SIM_SPEED) * 60);

console.log(`Simulator starting (speed=${SIM_SPEED}x, interval=${intervalMs}ms, scenario=${scenario ?? "none"})`);

if (runOnce) {
  await tick();
  process.exit(0);
}

await tick();
setInterval(tick, intervalMs);
