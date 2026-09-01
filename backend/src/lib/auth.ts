import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { env } from "../env";
import { prisma } from "../db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.CORS_ORIGIN],

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // 24h build; no mail round-trip on signup
  },

  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "CLIENT", input: false },
      companyName: { type: "string", required: false },
      phone: { type: "string", required: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
  },
});

export type AuthSession = typeof auth.$Infer.Session;
