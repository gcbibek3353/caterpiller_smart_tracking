import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { ZodTypeAny, z } from "zod";
import { AppError } from "../lib/http";
import type { AppEnv } from "../types";

type Target = "json" | "query" | "param";

const KEY = {
  json: "validJson",
  query: "validQuery",
  param: "validParam",
} as const;

/**
 * Validates one part of the request against a zod schema and stashes the parsed
 * (coerced, defaulted) value on the context. Read it back with `valid()`.
 *
 *   app.post("/", validate("json", CreateBookingInput), (c) => {
 *     const body = valid(c, "json", CreateBookingInput);   // fully typed
 *   })
 */
export const validate = <S extends ZodTypeAny>(target: Target, schema: S) =>
  createMiddleware<AppEnv>(async (c, next) => {
    let raw: unknown;

    if (target === "json") {
      raw = await c.req.json().catch(() => {
        throw new AppError("INVALID_JSON", "Request body is not valid JSON", 400);
      });
    } else if (target === "query") {
      raw = c.req.query();
    } else {
      raw = c.req.param();
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Invalid request ${target}`,
        422,
        parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      );
    }

    c.set(KEY[target], parsed.data);
    await next();
  });

/** Typed read-back. The schema argument is only used to infer the type. */
export const valid = <S extends ZodTypeAny>(
  c: Context<AppEnv>,
  target: Target,
  _schema: S,
): z.infer<S> => c.get(KEY[target]) as z.infer<S>;
