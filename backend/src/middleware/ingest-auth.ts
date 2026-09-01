import type { Context, Next } from "hono";
import { loadEnv } from "../env";

export async function requireIngestApiKey(c: Context, next: Next) {
  const apiKey = c.req.header("x-api-key");
  const { INGEST_API_KEY } = loadEnv();

  if (!apiKey || apiKey !== INGEST_API_KEY) {
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid or missing x-api-key" } },
      401,
    );
  }

  await next();
}
