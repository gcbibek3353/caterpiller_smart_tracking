/**
 * Kept as an alias so `bun index.ts` still works. The real entry point is
 * `src/index.ts`: it serves auth, equipment, sites, operators, bookings AND
 * the telemetry/analytics routers.
 *
 * This file previously served `createTelemetryApp()` on its own, which meant
 * `bun run dev` exposed only telemetry — behind the x-dev-role stub in
 * src/app.ts that grants ADMIN to every request in development — while auth,
 * equipment and bookings were not served at all.
 */
export { default } from "./src/index";
