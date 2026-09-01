import { createTelemetryApp } from "./src/app";
import { loadEnv } from "./src/env";

const env = loadEnv();
const app = createTelemetryApp();

export default {
  port: env.PORT,
  fetch: app.fetch,
};

console.log(`Telemetry API listening on http://localhost:${env.PORT}`);
