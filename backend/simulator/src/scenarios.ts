import type { Scenario } from "../../src/shared";
import { SCENARIOS } from "../../src/shared";

export function parseScenario(arg: string | undefined): Scenario | undefined {
  if (!arg) return undefined;
  const normalized = arg.toLowerCase().trim();
  if ((SCENARIOS as readonly string[]).includes(normalized)) {
    return normalized as Scenario;
  }
  throw new Error(
    `Unknown scenario "${arg}". Valid: ${SCENARIOS.join(", ")}`,
  );
}

export const SCENARIO_DESCRIPTIONS: Record<Scenario, string> = {
  idle: "Equipment remains IDLE during working hours with minimal movement",
  dead: "Equipment stays OFF — no engine hours, no movement",
  theft: "Equipment leaves site geofence at 02:00 at ~70 km/h (deterministic trigger hour)",
  siphon: "Fuel drops 30-40% in one tick while engine is OFF",
  overheat: "Temperature ramps abnormally past 105°C threshold",
  offline: "No telemetry emitted for first 3 hours of simulation",
};
