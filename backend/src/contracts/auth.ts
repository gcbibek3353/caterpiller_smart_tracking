import { z } from "zod";
import { RoleSchema } from "./common";

export const RegisterInput = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1).max(120),
  companyName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
});
export type RegisterInput = z.infer<typeof RegisterInput>;

export const LoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginInput>;

/** Shape of `GET /api/auth/me`. Never includes passwordHash or session token. */
export const MeOutput = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  companyName: z.string().nullable(),
  phone: z.string().nullable(),
  image: z.string().nullable(),
  createdAt: z.date(),
});
export type MeOutput = z.infer<typeof MeOutput>;
