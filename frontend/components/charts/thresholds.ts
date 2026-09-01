/**
 * Duplicated from backend/src/services/anomaly/config.ts's `overheat.maxTempC`
 * on purpose (frontend has no import path into the backend package) — the
 * team decided against a shared package for exactly this kind of constant
 * too. If D retunes that threshold, this needs updating in the same PR.
 */
export const ANOMALY_CONFIG_OVERHEAT_MAX_C = 105;
