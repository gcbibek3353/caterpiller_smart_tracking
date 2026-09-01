import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Role } from "@prisma/client";
import { telemetry, jobs } from "./routes/telemetry";
import { equipmentAnalytics, fleetAnalytics } from "./routes/equipment-analytics";
import { loadEnv } from "./env";
import type { AuthUser } from "./lib/equipment-access";

/**
 * Telemetry & analytics routes — mount into the main Hono app.
 * Person A's bootstrap should call: app.route('/api/telemetry', telemetryRoutes)
 */
export function createTelemetryApp() {
  const app = new Hono();
  const env = loadEnv();

  app.use(
    "*",
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );

  app.get("/health", (c) => c.json({ data: { status: "ok", module: "telemetry" } }));

  app.route("/api/telemetry", telemetry);
  app.route("/api/jobs", jobs);
  app.route("/api/equipment", equipmentAnalytics);
  app.route("/api/analytics", fleetAnalytics);

  /** Dev stub auth — replace with better-auth middleware from Person A */
  app.use("/api/equipment/*", async (c, next) => {
    const devRole = c.req.header("x-dev-role") as Role | undefined;
    const devUserId = c.req.header("x-dev-user-id") ?? "dev-admin";
    if (devRole || process.env.NODE_ENV === "development") {
      c.set("user", {
        id: devUserId,
        role: devRole ?? "ADMIN",
        email: "dev@local",
      } satisfies AuthUser);
    }
    await next();
  });

  app.use("/api/analytics/*", async (c, next) => {
    const devRole = c.req.header("x-dev-role") as Role | undefined;
    c.set("user", {
      id: c.req.header("x-dev-user-id") ?? "dev-admin",
      role: devRole ?? "ADMIN",
      email: "dev@local",
    } satisfies AuthUser);
    await next();
  });

  return app;
}

export { telemetry, jobs, equipmentAnalytics, fleetAnalytics };
