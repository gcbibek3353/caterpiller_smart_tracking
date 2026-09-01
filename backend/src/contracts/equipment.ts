import { z } from "zod";
import {
  Bucket,
  EquipmentStatusSchema,
  EquipmentTypeSchema,
  IsoDateTime,
  Pagination,
} from "./common";

const Money = z.coerce.number().nonnegative().max(1_000_000);
const Lat = z.coerce.number().min(-90).max(90);
const Lng = z.coerce.number().min(-180).max(180);

export const CreateEquipmentInput = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Z0-9-]+$/, "Use A-Z, 0-9 and dashes only"),
  name: z.string().min(1).max(120),
  type: EquipmentTypeSchema,
  make: z.string().max(80).optional(),
  model: z.string().max(80).optional(),
  year: z.coerce.number().int().min(1950).max(2100).optional(),
  status: EquipmentStatusSchema.optional(),
  dailyRate: Money,
  hourlyRate: Money.optional(),
  meterHours: z.coerce.number().nonnegative().default(0),
  fuelCapacityL: z.coerce.number().int().positive().default(300),
  homeLat: Lat,
  homeLng: Lng,
  imageUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateEquipmentInput = z.infer<typeof CreateEquipmentInput>;

/** PATCH — every field optional, but the body may not be empty. */
export const UpdateEquipmentInput = CreateEquipmentInput.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "Provide at least one field to update" },
);
export type UpdateEquipmentInput = z.infer<typeof UpdateEquipmentInput>;

export const EquipmentListQuery = Pagination.extend({
  type: EquipmentTypeSchema.optional(),
  status: EquipmentStatusSchema.optional(),
  q: z.string().max(120).optional(),
  /** Both required together — returns only machines free for the whole window. */
  availableFrom: IsoDateTime.optional(),
  availableTo: IsoDateTime.optional(),
}).refine((v) => !!v.availableFrom === !!v.availableTo, {
  message: "availableFrom and availableTo must be provided together",
  path: ["availableTo"],
}).refine((v) => !v.availableFrom || !v.availableTo || v.availableFrom < v.availableTo, {
  message: "availableFrom must be before availableTo",
  path: ["availableFrom"],
});
export type EquipmentListQuery = z.infer<typeof EquipmentListQuery>;

export const TIMESERIES_METRICS = [
  "fuelPct",
  "engineTempC",
  "engineHours",
  "speedKph",
  "engineState",
] as const;

export const TimeseriesQuery = z.object({
  /** Comma-separated: `?metric=fuelPct,engineTempC` */
  metric: z
    .string()
    .default("fuelPct,engineTempC")
    .transform((s) => s.split(",").map((m) => m.trim()).filter(Boolean))
    .pipe(z.array(z.enum(TIMESERIES_METRICS)).min(1)),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  bucket: Bucket,
});
export type TimeseriesQuery = z.infer<typeof TimeseriesQuery>;

export const TrackQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(2000),
});
export type TrackQuery = z.infer<typeof TrackQuery>;

export const DailyQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export type DailyQuery = z.infer<typeof DailyQuery>;
