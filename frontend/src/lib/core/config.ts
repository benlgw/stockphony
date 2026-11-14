/**
 * Environment-driven settings. Vite only exposes variables prefixed with VITE_,
 * and inlines them at build time, so these are plain constants at runtime.
 */

/** Where the Python backend's WebSocket lives. */
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';

/** Base URL for the REST endpoints (stock search). Empty string = same origin, via the Vite proxy. */
export const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Demo mode. With no backend running, search falls back to a small built-in list
 * and the charts draw generated data, so the UI can still be shown. Turn this off
 * (VITE_USE_MOCK=false) as soon as the backend is up.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

/** Reconnect backoff: 1s, 2s, 4s... capped here. */
export const MAX_RECONNECT_MS = 15_000;

/** Charts are downsampled to this many points before drawing. See PriceChart. */
export const MAX_CHART_POINTS = 400;
