import { z } from "zod";
import { EquipmentTypeSchema } from "./common";

export const ForecastQuery = z.object({
  weeks: z.coerce.number().int().min(1).max(12).default(8),
  type: EquipmentTypeSchema.optional(),
});
export type ForecastQuery = z.infer<typeof ForecastQuery>;

export const RunForecastInput = z
  .object({
    type: EquipmentTypeSchema.optional(),
    weeks: z.coerce.number().int().min(1).max(12).default(8),
  })
  .default({});
export type RunForecastInput = z.infer<typeof RunForecastInput>;

export const FORECAST_MODELS = ["holt-winters", "seasonal-naive", "ridge"] as const;
