import { z } from "zod";
import {
  Role,
  EquipmentType,
  EquipmentStatus,
  BookingStatus,
  CheckType,
  EngineState,
  Severity,
  AnomalyStatus,
} from "@prisma/client";

// Enums come straight from the generated Prisma client, so a schema change is a
// compile error here rather than a runtime surprise in a route.
export const RoleSchema = z.nativeEnum(Role);
export const EquipmentTypeSchema = z.nativeEnum(EquipmentType);
export const EquipmentStatusSchema = z.nativeEnum(EquipmentStatus);
export const BookingStatusSchema = z.nativeEnum(BookingStatus);
export const CheckTypeSchema = z.nativeEnum(CheckType);
export const EngineStateSchema = z.nativeEnum(EngineState);
export const SeveritySchema = z.nativeEnum(Severity);
export const AnomalyStatusSchema = z.nativeEnum(AnomalyStatus);

/** All timestamps cross the wire as ISO-8601 UTC strings. */
export const IsoDateTime = z.coerce.date();
export const IsoDate = z.coerce.date();

export const IdParam = z.object({ id: z.string().min(1) });

export const Pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type Pagination = z.infer<typeof Pagination>;

/** `from`/`to` window shared by every timeseries-ish endpoint. */
export const DateRange = z
  .object({ from: IsoDateTime.optional(), to: IsoDateTime.optional() })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "`from` must be before `to`",
    path: ["from"],
  });

export const Bucket = z.enum(["10m", "1h", "1d"]).default("1h");
