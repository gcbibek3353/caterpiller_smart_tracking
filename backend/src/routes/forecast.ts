import { Hono } from "hono";
import { ForecastQuery, RunForecastInput } from "../contracts/forecast";
import { prisma } from "../db";
import { ok } from "../lib/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { valid, validate } from "../middleware/validate";
import { buildRecommendation } from "../services/forecast/recommend";
import { runForecastAll, runForecastForSite, runForecastForType } from "../services/forecast/runner";
import type { AppEnv } from "../types";

export const forecastRoutes = new Hono<AppEnv>();

/**
 * Latest generation per (equipmentType, siteId) series, up to `weeks`
 * horizon rows each. `siteId` query param is tri-state: omitted returns
 * every series (company-wide + every site), `"company"` scopes to
 * company-wide only, a real id scopes to just that site.
 *
 * `DemandForecast` doesn't persist the recommendation sentence — only the
 * one-off `POST /run` response ever had it. Rebuilt here per row instead of
 * a migration: `buildRecommendation` is a pure function of exactly the
 * columns already on the row (predicted/upper/fleetSize/periodStart/siteId),
 * so this is just replaying the same computation the runner did at write
 * time. Site rows need the site's name for the sentence, so those are
 * joined in one extra query rather than N+1.
 */
forecastRoutes.get("/demand", requireAuth, requireRole("ADMIN"), validate("query", ForecastQuery), async (c) => {
  const q = valid(c, "query", ForecastQuery);

  const where: { equipmentType?: typeof q.type; siteId?: string | null } = {};
  if (q.type) where.equipmentType = q.type;
  if (q.siteId === "company") where.siteId = null;
  else if (q.siteId) where.siteId = q.siteId;

  const latestPerSeries = await prisma.demandForecast.groupBy({
    by: ["equipmentType", "siteId"],
    where,
    _max: { generatedAt: true },
  });

  const rows = await Promise.all(
    latestPerSeries
      .filter((row) => row._max.generatedAt !== null)
      .map((row) =>
        prisma.demandForecast.findMany({
          where: { equipmentType: row.equipmentType, siteId: row.siteId, generatedAt: row._max.generatedAt! },
          orderBy: { horizonWeek: "asc" },
          take: q.weeks,
        }),
      ),
  );

  const flat = rows.flat();
  const siteIds = [...new Set(flat.map((r) => r.siteId).filter((id): id is string => id !== null))];
  const sites = siteIds.length
    ? await prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
    : [];
  const siteNameById = new Map(sites.map((s) => [s.id, s.name]));

  const withRecommendations = flat.map((r) => ({
    ...r,
    siteName: r.siteId ? siteNameById.get(r.siteId) ?? null : null,
    recommendation: buildRecommendation({
      equipmentType: r.equipmentType,
      siteId: r.siteId,
      siteLabel: r.siteId ? siteNameById.get(r.siteId) : undefined,
      weekStart: r.periodStart.toISOString().slice(0, 10),
      predictedWeeklyRentalDays: r.predicted,
      upperWeeklyRentalDays: r.upper,
      fleetSize: r.fleetSize,
    }).sentence,
  }));

  return ok(c, withRecommendations);
});

/** Sites with at least one real forecast — for the frontend's site picker. */
forecastRoutes.get("/sites", requireAuth, requireRole("ADMIN"), async (c) => {
  const rows = await prisma.demandForecast.findMany({
    where: { siteId: { not: null } },
    distinct: ["siteId"],
    select: { siteId: true },
  });
  const siteIds = rows.map((r) => r.siteId!);
  if (siteIds.length === 0) return ok(c, []);

  const sites = await prisma.site.findMany({
    where: { id: { in: siteIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return ok(c, sites);
});

/** Manual trigger — steps.md §3: "every scheduled job also gets a manual POST trigger." */
forecastRoutes.post("/run", requireAuth, requireRole("ADMIN"), validate("json", RunForecastInput), async (c) => {
  const input = valid(c, "json", RunForecastInput);

  if (input.type && input.siteId) {
    const result = await runForecastForSite(prisma, input.siteId, input.type, input.weeks);
    return ok(c, result ? [result] : []);
  }

  if (input.type) {
    const result = await runForecastForType(prisma, input.type, input.weeks);
    return ok(c, result ? [result] : []);
  }

  const results = await runForecastAll(prisma, input.weeks);
  return ok(c, results);
});
