import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * The response envelope agreed in the A1 contract workshop.
 * Success: { data }        Failure: { error: { code, message, details? } }
 * Every route returns one of these two shapes. No exceptions.
 */
export type ApiSuccess<T> = { data: T };
export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export const ok = <T>(c: Context, data: T, status: ContentfulStatusCode = 200) =>
  c.json<ApiSuccess<T>>({ data }, status);

/** Throw this anywhere; the error middleware turns it into the envelope. */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: ContentfulStatusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Resource") =>
  new AppError("NOT_FOUND", `${what} not found`, 404);
export const unauthorized = (message = "Authentication required") =>
  new AppError("UNAUTHORIZED", message, 401);
export const forbidden = (message = "You do not have access to this resource") =>
  new AppError("FORBIDDEN", message, 403);
export const badRequest = (message: string, details?: unknown) =>
  new AppError("BAD_REQUEST", message, 400, details);
export const conflict = (message: string, details?: unknown) =>
  new AppError("CONFLICT", message, 409, details);
