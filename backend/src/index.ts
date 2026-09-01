import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { prisma } from "./db";
import { ok } from "./lib/http";
import "./lib/serialize"; // installs the BigInt JSON patch
import { onError, onNotFound } from "./middleware/error";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { equipmentRoutes } from "./routes/equipment";
import { siteRoutes } from "./routes/sites";
import { operatorRoutes } from "./routes/operators";
import { bookingRoutes } from "./routes/bookings";
import { telemetry, jobs } from "./routes/telemetry";
import { equipmentAnalytics, fleetAnalytics } from "./routes/equipment-analytics";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("*", logger());

// credentials:true because auth rides a better-auth session cookie, not a
// bearer token — the browser will not send it cross-origin otherwise.
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN,  // string[] — all allowed dev origins
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization", "x-api-key"],
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.onError(onError);
app.notFound(onNotFound);

app.get("/health", async (c) => {
  const startedAt = performance.now();
  let database: "up" | "down" = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "down";
  }

  return ok(c, {
    status: database === "up" ? "ok" : "degraded",
    database,
    latencyMs: Math.round(performance.now() - startedAt),
    uptimeSec: Math.round(process.uptime()),
    now: new Date().toISOString(),
  });
});

// ── Route modules mount here as each owner lands them ──
app.route("/api/auth", authRoutes); // A5 ✅
app.route("/api/equipment", equipmentRoutes); // A7 ✅
app.route("/api/sites", siteRoutes); // A7 ✅
app.route("/api/operators", operatorRoutes); // A7 ✅
app.route("/api/bookings", bookingRoutes); // B4 ✅
// app.route("/api/scan",      scanRoutes);       // B6
app.route("/api/telemetry", telemetry); // C4 ✅
app.route("/api/jobs", jobs); // C4 ✅
// Analytics only defines sub-paths (/:id/summary, /:id/timeseries, /:id/track,
// /:id/daily), so it shares the /api/equipment prefix with A's CRUD router
// without shadowing it. It now sits behind equipmentRoutes' real requireAuth
// instead of the x-dev-role stub in src/app.ts.
app.route("/api/equipment", equipmentAnalytics); // C6 ✅
// fleetAnalytics reads c.get("user") and 403s without one. Under src/app.ts
// that was filled by the x-dev-role stub; here it needs the real session guard,
// otherwise even a signed-in ADMIN gets 403. equipmentAnalytics does not need
// this line — it inherits requireAuth from equipmentRoutes' /api/equipment/*.
app.use("/api/analytics/*", requireAuth);
app.route("/api/analytics", fleetAnalytics); // C6 ✅
// app.route("/api/anomalies", anomalyRoutes);    // D5
// app.route("/api/forecast",  forecastRoutes);   // D6

console.log(`🚜 API listening on http://localhost:${env.PORT}`);
console.log(`   health → http://localhost:${env.PORT}/health`);

export default { port: env.PORT, fetch: app.fetch };
