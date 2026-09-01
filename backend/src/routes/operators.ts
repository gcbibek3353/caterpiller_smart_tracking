import { Hono } from "hono";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { forbidden, notFound, ok } from "../lib/http";
import { paginated } from "../lib/serialize";
import { requireAuth } from "../middleware/auth";
import { validate, valid } from "../middleware/validate";
import { CreateOperatorInput, IdParam, Pagination, UpdateOperatorInput } from "../contracts";
import type { AppEnv, SessionUser } from "../types";

export const operatorRoutes = new Hono<AppEnv>();
operatorRoutes.use("*", requireAuth);

const resolveOwner = (user: SessionUser, requested?: string) =>
  user.role === "ADMIN" ? (requested ?? user.id) : user.id;

const assertOwns = (user: SessionUser, clientId: string) => {
  if (user.role !== "ADMIN" && clientId !== user.id) {
    throw forbidden("This operator belongs to another client");
  }
};

operatorRoutes.get("/", validate("query", Pagination), async (c) => {
  const { page, limit } = valid(c, "query", Pagination);
  const user = c.get("user");
  const where: Prisma.OperatorWhereInput = user.role === "ADMIN" ? {} : { clientId: user.id };

  const [items, total] = await Promise.all([
    prisma.operator.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.operator.count({ where }),
  ]);

  return ok(c, paginated(items, total, page, limit));
});

operatorRoutes.get("/:id", validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);
  const op = await prisma.operator.findUnique({ where: { id } });
  if (!op) throw notFound("Operator");
  assertOwns(c.get("user"), op.clientId);
  return ok(c, op);
});

operatorRoutes.post("/", validate("json", CreateOperatorInput), async (c) => {
  const { clientId, ...rest } = valid(c, "json", CreateOperatorInput);
  const owner = resolveOwner(c.get("user"), clientId);
  return ok(c, await prisma.operator.create({ data: { ...rest, clientId: owner } }), 201);
});

operatorRoutes.patch(
  "/:id",
  validate("param", IdParam),
  validate("json", UpdateOperatorInput),
  async (c) => {
    const { id } = valid(c, "param", IdParam);
    const body = valid(c, "json", UpdateOperatorInput);
    const existing = await prisma.operator.findUnique({ where: { id } });
    if (!existing) throw notFound("Operator");
    assertOwns(c.get("user"), existing.clientId);
    return ok(c, await prisma.operator.update({ where: { id }, data: body }));
  },
);

operatorRoutes.delete("/:id", validate("param", IdParam), async (c) => {
  const { id } = valid(c, "param", IdParam);
  const existing = await prisma.operator.findUnique({ where: { id } });
  if (!existing) throw notFound("Operator");
  assertOwns(c.get("user"), existing.clientId);

  await prisma.booking.updateMany({ where: { operatorId: id }, data: { operatorId: null } });
  await prisma.operator.delete({ where: { id } });
  return ok(c, { id, deleted: true });
});
