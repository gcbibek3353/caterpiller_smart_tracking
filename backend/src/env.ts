import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),

  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be >= 32 chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:4000"),

  PORT: z.coerce.number().int().positive().default(4000),
  /**
   * Comma-separated list. Next falls back to :3001 when :3000 is taken, and a
   * mismatched origin fails as `INVALID_ORIGIN` at sign-in — a confusing way to
   * lose an hour. Listing both keeps dev working whatever port Next picks.
   */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://localhost:3001")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean))
    .pipe(z.array(z.string().url()).min(1)),

  INGEST_API_KEY: z.string().min(1),

  MAIL_MODE: z.enum(["console", "resend"]).default("console"),
  MAIL_FROM: z.string().default("alerts@rental.local"),
  RESEND_API_KEY: z.string().optional().default(""),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment. Check backend/.env against backend/.env.example:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
