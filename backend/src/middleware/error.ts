import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { AppError, type ApiError } from "../lib/http";

const envelope = (c: Context, status: number, code: string, message: string, details?: unknown) =>
  c.json<ApiError>({ error: { code, message, ...(details ? { details } : {}) } }, status as 400);

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return envelope(c, err.status, err.code, err.message, err.details);
  }

  if (err instanceof ZodError) {
    return envelope(c, 422, "VALIDATION_ERROR", "Request validation failed", err.issues);
  }

  if (err instanceof HTTPException) {
    return envelope(c, err.status, "HTTP_ERROR", err.message);
  }

  // Prisma surfaces these as tagged error objects rather than named classes.
  const code = (err as { code?: string }).code;
  if (code === "P2002") {
    return envelope(c, 409, "DUPLICATE", "A record with these values already exists");
  }
  if (code === "P2025") {
    return envelope(c, 404, "NOT_FOUND", "Resource not found");
  }

  console.error("[unhandled]", err);
  return envelope(c, 500, "INTERNAL_ERROR", "Something went wrong on our end");
};

export const onNotFound: NotFoundHandler = (c) =>
  envelope(c, 404, "NOT_FOUND", `No route for ${c.req.method} ${c.req.path}`);
