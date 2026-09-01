import { z } from "zod";

const EnvSchema = z.object({
  /** Pooled connection string. This is what the running server uses. */
  DATABASE_URL: z.string().url(),
  /**
   * Direct (non-pooled) connection string — the same Neon host without `-pooler`.
   * Only the Prisma CLI and pg_dump read it; the server never opens it. Optional
   * so a plain local Postgres, which has no pooler, still boots with one URL set.
   */
  DIRECT_URL: z.string().url().optional(),
  /**
   * Where DESTRUCTIVE suites point. Defaults to local Docker on purpose: the
   * shared Neon database is everyone's working data, and `test:api` TRUNCATEs.
   */
  TEST_DATABASE_URL: z
    .string()
    .url()
    .default("postgresql://rental:rental@localhost:5433/rental?schema=public"),

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

/**
 * Function form of `env`, for the modules written against it
 * (`middleware/ingest-auth.ts`, `backend/index.ts` — `src/app.ts` was
 * deleted, its routes mounted straight into `src/index.ts` instead).
 *
 * The schema is parsed once at module load, so this is a plain accessor and not
 * a re-parse. Both forms are supported deliberately: renaming either one would
 * break the other half of the codebase mid-hackathon.
 */
export const loadEnv = (): Env => env;
