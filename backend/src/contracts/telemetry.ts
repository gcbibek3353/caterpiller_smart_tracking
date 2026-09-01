import { z } from "zod";
import { EngineStateSchema, IsoDateTime } from "./common";

export const TelemetryTick = z.object({
  equipmentId: z.string().min(1),
  bookingId: z.string().min(1).nullish(),
  ts: IsoDateTime,
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  engineState: EngineStateSchema,
  engineHours: z.coerce.number().nonnegative().max(200_000),
  fuelPct: z.coerce.number().min(0).max(100),
  engineTempC: z.coerce.number().min(-60).max(300),
  ambientTempC: z.coerce.number().min(-60).max(80).nullish(),
  speedKph: z.coerce.number().min(0).max(200).default(0),
  operatorId: z.string().min(1).nullish(),
});
export type TelemetryTick = z.infer<typeof TelemetryTick>;

/**
 * Accepts either a bare array or `{ ticks: [...] }` — the simulator sends one,
 * curl-by-hand tends to send the other, and neither should 400 at 3am.
 */
export const IngestInput = z
  .union([
    z.array(TelemetryTick),
    z.object({ ticks: z.array(TelemetryTick) }).transform((v) => v.ticks),
  ])
  .pipe(z.array(TelemetryTick).min(1).max(5000));
export type IngestInput = z.infer<typeof IngestInput>;

export const RollupInput = z
  .object({
    equipmentId: z.string().min(1).optional(),
    from: IsoDateTime.optional(),
    to: IsoDateTime.optional(),
  })
  .default({});
export type RollupInput = z.infer<typeof RollupInput>;
