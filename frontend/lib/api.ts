import type { Paginated } from "./types";

/**
 * Origin of the API — or the empty string, meaning "same origin, reached
 * through the `/api` rewrite in next.config.ts". `bun run dev:https` selects
 * the second form so a phone on the LAN has no cross-origin call to make; see
 * the rewrite's comment for why that is the only arrangement that works there.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Only used to resolve a relative API_URL; ignored when it is absolute. */
const sameOrigin = () =>
  typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;

/** The backend's failure envelope: `{ error: { code, message, details? } }`. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field-level messages from a 422, keyed by path — for form error display. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as { path?: string; message?: string }[]) {
      if (d?.path && d?.message) out[d.path] = d.message;
    }
    return out;
  }
}

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Appended as a query string; undefined and null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
};

/**
 * Typed fetch for the API.
 *
 * - `credentials: "include"` on every call, because auth is a better-auth
 *   session cookie rather than a bearer token. Omit it and every request is
 *   anonymous.
 * - Sends `Origin`, which better-auth requires on state-changing requests
 *   (it rejects `MISSING_OR_NULL_ORIGIN`). Browsers set this automatically.
 * - Unwraps `{ data }` so callers get the payload directly, and throws
 *   `ApiError` for `{ error }` so you can `try/catch` instead of checking shapes.
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { body, query, headers, ...rest } = options;

  const url = new URL(path.startsWith("http") ? path : `${API_URL}${path}`, sameOrigin());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("NETWORK", `Can't reach the API at ${API_URL}. Is it running?`, 0);
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const err = payload?.error;
    throw new ApiError(
      err?.code ?? "HTTP_ERROR",
      err?.message ?? `Request failed with ${res.status}`,
      res.status,
      err?.details,
    );
  }

  return payload?.data as T;
}

export const api = {
  get: <T>(path: string, query?: FetchOptions["query"]) =>
    apiFetch<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  /** Convenience for the paginated list endpoints. */
  list: <T>(path: string, query?: FetchOptions["query"]) =>
    apiFetch<Paginated<T>>(path, { method: "GET", query }),
};
