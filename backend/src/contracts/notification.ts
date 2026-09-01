import { z } from "zod";
import { IsoDateTime, Pagination } from "./common";

/** Mirrors Notification.type — see backend/prisma/schema.prisma's comment for the full list. */
export const NotificationListQuery = Pagination.extend({
  status: z.enum(["PENDING", "SENT", "FAILED"]).optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;
