"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "./api";

type Snapshot<T> = { key: string; data: T | null; error: ApiError | null };

const EMPTY: Snapshot<never> = { key: "", data: null, error: null };

/**
 * Minimal data hook. Deliberately small — if the app grows past this,
 * swap in TanStack Query rather than layering more onto it.
 */
export function useApi<T>(path: string | null, query?: Record<string, string | number | undefined>) {
  const key = `${path}|${JSON.stringify(query ?? {})}`;

  const [snap, setSnap] = useState<Snapshot<T>>(EMPTY as Snapshot<T>);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Deliberately contains no setState: it resolves to a snapshot and lets the
   * caller decide whether to store it. That keeps the effect below a
   * subscribe-and-set-in-a-callback, which is the shape
   * react-hooks/set-state-in-effect asks for — a setState reachable from the
   * effect body is a cascading render even when the fetch itself is async.
   */
  const fetchSnapshot = useCallback(async (): Promise<Snapshot<T>> => {
    // `path: null` means "nothing to load yet" — callers pass it to hold off on
    // a request until an id is known. Guarded here as well as in the effect so
    // a stray refetch() cannot fire one at the literal string "null".
    if (!path) return { key, data: null, error: null };
    try {
      return { key, data: await apiFetch<T>(path, { method: "GET", query }), error: null };
    } catch (e) {
      return { key, data: null, error: e instanceof ApiError ? e : new ApiError("UNKNOWN", String(e), 0) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!path) return;
    /**
     * `alive` drops a response whose effect has already been torn down, so a
     * slow first request cannot land after a fast second one and overwrite it.
     * Change a filter twice quickly and the screen would otherwise settle on
     * the earlier result.
     */
    let alive = true;
    void fetchSnapshot().then((next) => {
      if (alive) setSnap(next);
    });
    return () => {
      alive = false;
    };
  }, [fetchSnapshot, path]);

  /**
   * Resolves only once the new data is in state — callers `await refetch()`
   * and then read, so settling early would hand them the values they were
   * trying to refresh.
   */
  const refetch = useCallback(async () => {
    setRefreshing(true);
    try {
      setSnap(await fetchSnapshot());
    } finally {
      setRefreshing(false);
    }
  }, [fetchSnapshot]);

  // Stale whenever the key has moved on: covers the first load and any change
  // of path or query, so nothing has to be flipped synchronously on the way in.
  const settled = snap.key === key;
  return {
    data: settled ? snap.data : null,
    error: settled ? snap.error : null,
    loading: Boolean(path) && (!settled || refreshing),
    refetch,
  };
}
