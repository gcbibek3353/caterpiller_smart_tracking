import { Hono } from "hono";
import { ForecastQuery, RunForecastInput } from "../contracts/forecast";
import { prisma } from "../db";
import { ok } from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import { runForecastAll, runForecastForType } from "../services/forecast/runner";
import type { AppEnv } from "../types";

export const forecastRoutes = new Hono<AppEnv>();

/** Latest generation per type, up to `weeks` horizon rows each. */
forecastRoutes.get("/demand", requireAuth, requireRole("ADMIN"), validate("query", ForecastQuery), async (c) => {
  const q = valid(c, "query", ForecastQuery);

  const latestPerType = await prisma.demandForecast.groupBy({
    by: ["equipmentType"],
    where: q.type ? { equipmentType: q.type } : undefined,
    _max: { generatedAt: true },
  });

  const rows = await Promise.all(
    latestPerType
      .filter((row) => row._max.generatedAt !== null)
      .map((row) =>
        prisma.demandForecast.findMany({
          where: { equipmentType: row.equipmentType, generatedAt: row._max.generatedAt! },
          orderBy: { horizonWeek: "asc" },
          take: q.weeks,
        }),
      ),
  );

  return ok(c, rows.flat());
});

/** Manual trigger — steps.md §3: "every scheduled job also gets a manual POST trigger." */
forecastRoutes.post("/run", requireAuth, requireRole("ADMIN"), validate("json", RunForecastInput), async (c) => {
  const input = valid(c, "json", RunForecastInput);

  if (input.type) {
    const result = await runForecastForType(prisma, input.type, input.weeks);
    return ok(c, result ? [result] : []);
  }

  const results = await runForecastAll(prisma, input.weeks);
  return ok(c, results);
});
