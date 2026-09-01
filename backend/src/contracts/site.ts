import { z } from "zod";

export const CreateSiteInput = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(300).optional(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(50).max(50_000).default(500),
  /** ADMIN may create a site for any client; CLIENT is forced to their own id. */
  clientId: z.string().optional(),
});
export type CreateSiteInput = z.infer<typeof CreateSiteInput>;

export const UpdateSiteInput = CreateSiteInput.omit({ clientId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field" });
export type UpdateSiteInput = z.infer<typeof UpdateSiteInput>;

export const CreateOperatorInput = z.object({
  name: z.string().min(1).max(120),
  licenseNo: z.string().max(60).optional(),
  phone: z.string().max(40).optional(),
  clientId: z.string().optional(),
});
export type CreateOperatorInput = z.infer<typeof CreateOperatorInput>;

export const UpdateOperatorInput = CreateOperatorInput.omit({ clientId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field" });
export type UpdateOperatorInput = z.infer<typeof UpdateOperatorInput>;
