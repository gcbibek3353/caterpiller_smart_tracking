import { Hono } from "hono";
import { auth } from "../lib/auth";
import { ok } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import type { AppEnv } from "../types";

export const authRoutes = new Hono<AppEnv>();

/**
 * Registered BEFORE the better-auth wildcard, otherwise better-auth swallows it
 * and returns 404. Order matters here.
 */
authRoutes.get("/me", requireAuth, (c) => {
  const u = c.get("user");
  return ok(c, {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    companyName: u.companyName ?? null,
    phone: u.phone ?? null,
    image: u.image ?? null,
  });
});

/**
 * better-auth owns the rest: /sign-up/email, /sign-in/email, /sign-out,
 * /get-session, ... It sets and reads the session cookie itself.
 *
 * `role` is declared `input: false` in lib/auth.ts, so a client cannot
 * self-assign ADMIN at signup — new users are always CLIENT.
 */
authRoutes.on(["GET", "POST"], "/*", (c) => auth.handler(c.req.raw));
