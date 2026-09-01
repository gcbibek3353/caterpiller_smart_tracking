import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { forbidden, notFound, ok } from "../lib/http";
import { paginated } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { validate, valid } from "../middleware/validate";
import { CreateSiteInput, IdParam, SiteListQuery, UpdateSiteInput } from "../contracts";
import type { AppEnv, SessionUser } from "../types";

export const siteRoutes = new Hono<AppEnv>();
siteRoutes.use("*", requireAuth);

/**
 * ADMIN may act for any client; a CLIENT is pinned to their own id no matter
 * what they send. Never trust a clientId from the body.
 */
const resolveOwner = (user: SessionUser, requested?: string) =>
  user.role === "ADMIN" ? (requested ?? user.id) : user.id;

const assertOwns = (user: SessionUser, clientId: string) => {
  if (user.role !== "ADMIN" && clientId !== user.id) {
    throw forbidden("This site belongs to another client");
  }
};

siteRoutes.get("/", validate("query", SiteListQuery), async (c) => {
  const { page, limit, clientId } = valid(c, "query", SiteListQuery);
  const user = c.get("user");

  /**
   * A CLIENT is pinned to their own rows and `?clientId=` is ignored rather
   * than honoured — otherwise the filter is an enumeration hole, same reasoning
   * as GET /api/bookings.
   */
  const where: Prisma.SiteWhereInput =
    user.role === "ADMIN" ? (clientId ? { clientId } : {}) : { clientId: user.id };

  const [items, total] = await Promise.all([
    prisma.site.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { client: { select: { id: true, name: true, companyName: true } } },
    }),
    prisma.site.count({ where }),
  ]);

  return ok(c, paginated(items, total, page, limit));
});

siteRoutes.get("/:id", validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) throw notFound("Site");
  assertOwns(c.get("user"), site.clientId);
  return ok(c, site);
});

siteRoutes.post("/", validate("json", CreateSiteInput), async (c) => {
  const { clientId, ...rest } = valid(c, "json", CreateSiteInput);
  const owner = resolveOwner(c.get("user"), clientId);
  const created = await prisma.site.create({ data: { ...rest, clientId: owner } });
  return ok(c, created, 201);
});

siteRoutes.patch(
  "/:id",
  validate("param", IdParam),
  validate("json", UpdateSiteInput),
  async (c) => {
    const { id } = valid(c, "param", IdParam);
    const body = valid(c, "json", UpdateSiteInput);

    const existing = await prisma.site.findUnique({ where: { id } });
    if (!existing) throw notFound("Site");
    assertOwns(c.get("user"), existing.clientId);

    return ok(c, await prisma.site.update({ where: { id }, data: body }));
  },
);

siteRoutes.delete("/:id", validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);
  const existing = await prisma.site.findUnique({ where: { id } });
  if (!existing) throw notFound("Site");
  assertOwns(c.get("user"), existing.clientId);

  // Bookings reference sites; detach rather than cascade-deleting history.
  await prisma.booking.updateMany({ where: { siteId: id }, data: { siteId: null } });
  await prisma.site.delete({ where: { id } });
  return ok(c, { id, deleted: true });
});
