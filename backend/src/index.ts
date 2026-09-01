import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { prisma } from "./db";
import { ok } from "./lib/http";
import "./lib/serialize"; // installs the BigInt JSON patch
import { onError, onNotFound } from "./middleware/error";
import { authRoutes } from "./routes/auth";
import { equipmentRoutes } from "./routes/equipment";
import { siteRoutes } from "./routes/sites";
import { operatorRoutes } from "./routes/operators";
import { anomalyRoutes } from "./routes/anomalies";
import { forecastRoutes } from "./routes/forecast";
import { notificationRoutes } from "./routes/notifications";
import { telemetry, jobs } from "./routes/telemetry";
import { equipmentAnalytics, fleetAnalytics } from "./routes/equipment-analytics";
import { bookingRoutes } from "./routes/bookings";
import { startScheduler } from "./jobs/scheduler";
import { optionalAuth, requireAuth, requireRole } from "./middleware/auth";
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
app.route("/api/equipment", equipmentAnalytics); // C4 ✅ — deeper sub-paths, no collision with A7's CRUD
app.route("/api/sites", siteRoutes); // A7 ✅
app.route("/api/operators", operatorRoutes); // A7 ✅
app.route("/api/bookings", bookingRoutes); // B4 ✅
// app.route("/api/scan",      scanRoutes);       // B6
app.route("/api/telemetry", telemetry); // C4 ✅ — machine-to-machine, guards itself via x-api-key
app.use("/api/jobs/*", requireAuth, requireRole("ADMIN")); // rollup trigger had no guard at all
app.route("/api/jobs", jobs); // C4 ✅
app.route("/api/analytics", fleetAnalytics); // C4 ✅
app.route("/api/anomalies", anomalyRoutes); // D5 ✅
app.route("/api/forecast", forecastRoutes); // D6 ✅
app.route("/api/notifications", notificationRoutes); // D10 ✅ — feed for the /alerts page

// In-process cron: realtime detectors, booking rules, daily detectors,
// weekly forecast retrain — every one also has a manual POST trigger above.
if (env.NODE_ENV !== "test") startScheduler();

console.log(`🚜 API listening on http://localhost:${env.PORT}`);
console.log(`   health → http://localhost:${env.PORT}/health`);

export default { port: env.PORT, fetch: app.fetch };
