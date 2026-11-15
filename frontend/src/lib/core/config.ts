/**
 * Environment-driven settings. Vite only exposes variables prefixed with VITE_,
 * and inlines them at build time, so these are plain constants at runtime.
 */

/**
 * Base URL for the backend's REST API. Empty string = same origin: requests to
 * /api go through the Vite dev proxy in vite.config.ts, which avoids CORS.
 */
export const API_URL = import.meta.env.VITE_API_URL ?? "";

/** Charts are downsampled to this many points before drawing. See PriceChart. */
export const MAX_CHART_POINTS = 150;

/** Each stock has its own tempo. New stocks start at DEFAULT_BPM. */
export const DEFAULT_BPM = 120;
export const MIN_BPM = 60;
export const MAX_BPM = 200;

/**
 * Leverage multiplies a stock's BPM, like leverage multiplies a position:
 * 10x turns 120 BPM into 1200. The backend accepts up to 2400 (200 x 10).
 */
export const LEVERAGE_OPTIONS = [1, 2, 5, 10] as const;
