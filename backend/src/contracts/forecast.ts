import { z } from "zod";
import { EquipmentTypeSchema } from "./common";

export const ForecastQuery = z.object({
  weeks: z.coerce.number().int().min(1).max(12).default(8),
  type: EquipmentTypeSchema.optional(),
  /**
   * Tri-state, not a plain optional string: omitted = every series (every
   * type company-wide + every site×type); `"company"` = company-wide only,
   * no per-site rows; a real id = just that site. `siteId=""` from an empty
   * form field coerces to omitted rather than a confusing 404-shaped filter.
   */
  siteId: z
    .string()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});
export type ForecastQuery = z.infer<typeof ForecastQuery>;

export const RunForecastInput = z
  .object({
    type: EquipmentTypeSchema.optional(),
    /** Only meaningful alongside `type` — runs just that one site×type series. */
    siteId: z.string().optional(),
    weeks: z.coerce.number().int().min(1).max(12).default(8),
  })
  .default({});
export type RunForecastInput = z.infer<typeof RunForecastInput>;

export const FORECAST_MODELS = ["holt-winters", "seasonal-naive", "gbm-lag"] as const;
