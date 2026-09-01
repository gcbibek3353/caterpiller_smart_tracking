import { Cron } from "croner";
import { prisma } from "../db";
import { runBookingAnomalyRules, runDailyAnomalyRules, runRealtimeAnomalyRules } from "../services/anomaly/runner";
import { runForecastAll } from "../services/forecast/runner";

/**
 * In-process scheduler (steps.md §10 / plan-24h.md D7):
 *   every 10 min  realtime anomaly detectors
 *   hourly        booking rules (overdue / upcoming)
 *   daily 00:15   daily rollup -> daily anomaly detectors
 *   weekly Sun 02:00  forecast retrain
 *
 * Every one of these also has a manual POST trigger (routes/anomalies.ts,
 * routes/forecast.ts) — during a live demo you cannot wait for a cron.
 *
 * NOTE: the daily *rollup* itself (Telemetry -> DailyUsage) is Person C's
 * services/rollup.ts (C4), not D's. This job only runs the daily detectors
 * against whatever DailyUsage rows already exist — wire the rollup call in
 * front of it once C4 lands, so the detectors see the day's freshly-rolled-up
 * numbers before running.
 */

type JobKey = "realtime" | "booking" | "dailyRollup" | "forecast";

const isRunning: Record<JobKey, boolean> = {
  realtime: false,
  booking: false,
  dailyRollup: false,
  forecast: false,
};

async function guarded(key: JobKey, fn: () => Promise<void>): Promise<void> {
  if (isRunning[key]) {
    console.warn(`[scheduler] ${key} still running, skipping this tick`);
    return;
  }
  isRunning[key] = true;
  try {
    await fn();
  } catch (err) {
    console.error(`[scheduler] ${key} job failed:`, err);
  } finally {
    isRunning[key] = false;
  }
}

export function startScheduler(): Cron[] {
  const jobs = [
    new Cron("*/10 * * * *", () =>
      guarded("realtime", async () => {
        const r = await runRealtimeAnomalyRules(prisma);
        console.log(`[scheduler] realtime rules: scanned ${r.scanned}, ${r.created} new anomalies`);
      }),
    ),

    new Cron("0 * * * *", () =>
      guarded("booking", async () => {
        const r = await runBookingAnomalyRules(prisma);
        console.log(
          `[scheduler] booking rules: scanned ${r.scanned}, ${r.created} new anomalies, ${r.upcomingReturns.length} return reminders due`,
        );
      }),
    ),

    new Cron("15 0 * * *", () =>
      guarded("dailyRollup", async () => {
        const r = await runDailyAnomalyRules(prisma);
        console.log(`[scheduler] daily rules: scanned ${r.scanned}, ${r.created} new anomalies`);
      }),
    ),

    new Cron("0 2 * * 0", () =>
      guarded("forecast", async () => {
        const results = await runForecastAll(prisma);
        console.log(`[scheduler] forecast retrain: ${results.length} equipment type(s)`);
      }),
    ),
  ];

  console.log("[scheduler] started — realtime */10m, booking hourly, daily 00:15, forecast weekly Sun 02:00");
  return jobs;
}
