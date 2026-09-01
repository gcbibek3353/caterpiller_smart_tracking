import { z } from "zod";
import { EquipmentTypeSchema, IsoDateTime, Pagination } from "./common";

export const FleetAnalyticsQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export type FleetAnalyticsQuery = z.infer<typeof FleetAnalyticsQuery>;

export const UtilizationQuery = z.object({
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
  type: EquipmentTypeSchema.optional(),
  groupBy: z.enum(["type", "week", "type_week"]).default("type_week"),
});
export type UtilizationQuery = z.infer<typeof UtilizationQuery>;

export const NotificationListQuery = Pagination.extend({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  type: z.string().max(60).optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;
