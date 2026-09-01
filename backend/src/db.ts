import { PrismaClient } from "@prisma/client";

// Singleton. `bun --watch` re-imports this module on every save, and a fresh
// PrismaClient per reload exhausts the Postgres connection pool within minutes.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
