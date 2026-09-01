import { z } from "zod";
import { AnomalyStatusSchema, IsoDateTime, Pagination, SeveritySchema } from "./common";

/** Catalogue from steps.md §9. Strings, not a Prisma enum, so D can add one without a schema change. */
export const ANOMALY_TYPES = [
  // daily
  "HIGH_IDLE",
  "ZERO_RUNTIME",
  "MISSING_OPERATOR",
  "UNASSIGNED_SITE",
  "LOW_UTILIZATION",
  "FUEL_EFFICIENCY_DRIFT",
  // realtime
  "GEOFENCE_BREACH",
  "NIGHT_MOVEMENT",
  "IMPLAUSIBLE_SPEED",
  "POSITION_JUMP",
  "FUEL_DROP",
  "OVERHEAT",
  "TELEMETRY_GAP",
  // booking
  "OVERDUE",
  // layer 2
  "STATISTICAL_OUTLIER",
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

export const AnomalyListQuery = Pagination.extend({
  status: AnomalyStatusSchema.optional(),
  severity: SeveritySchema.optional(),
  type: z.enum(ANOMALY_TYPES).optional(),
  equipmentId: z.string().optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export type AnomalyListQuery = z.infer<typeof AnomalyListQuery>;

/** OPEN is not settable — an anomaly only ever moves forward from OPEN. */
export const UpdateAnomalyInput = z.object({
  status: z.enum([
    AnomalyStatusSchema.enum.ACKNOWLEDGED,
    AnomalyStatusSchema.enum.RESOLVED,
    AnomalyStatusSchema.enum.FALSE_POSITIVE,
  ]),
});
export type UpdateAnomalyInput = z.infer<typeof UpdateAnomalyInput>;

export const RunAnomaliesInput = z
  .object({
    scope: z.enum(["daily", "realtime", "booking", "all"]).default("all"),
    equipmentId: z.string().optional(),
    from: IsoDateTime.optional(),
    to: IsoDateTime.optional(),
  })
  .default({});
export type RunAnomaliesInput = z.infer<typeof RunAnomaliesInput>;
