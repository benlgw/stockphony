/**
 * Calls to the backend's REST API. Every request goes through `request`, so
 * errors arrive in one shape: an ApiError with a readable message.
 */

import { API_URL } from "$lib/core/config";
import type { History, KeyId, NoteSchedule, SectionId } from "$lib/core/types";

export class ApiError extends Error {
  /** HTTP status, or 0 when the backend could not be reached at all. */
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, init);
  } catch {
    // fetch only throws when there is no response at all: server down, wrong port.
    throw new ApiError("Can't reach the backend. Is it running?", 0);
  }

  if (!response.ok) {
    // FastAPI puts the reason in `detail`, e.g. "No price history for LEH".
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* not JSON: keep the generic message */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

/** encodeURIComponent, because tickers like BRK-B appear in the URL path. */
const stockPath = (ticker: string) => `/api/stocks/${encodeURIComponent(ticker)}`;

export const checkHealth = () => request<{ ok: boolean; priceSource: string }>("/api/health");

export const getHistory = (ticker: string) => request<History>(`${stockPath(ticker)}/history`);

export function getNotes(ticker: string, section: SectionId, key: KeyId, bpm: number) {
  const query = new URLSearchParams({ section, key, bpm: String(bpm) });
  return request<NoteSchedule>(`${stockPath(ticker)}/notes?${query}`);
}

/**
 * Asks the backend to fetch a stock's prices in the background, without
 * waiting for an answer. Called when a drag starts, so by the time the stock
 * is dropped its prices are usually already cached.
 */
export function preloadStock(ticker: string): void {
  fetch(`${API_URL}${stockPath(ticker)}/preload`, { method: "POST" }).catch(() => {
    /* a failed preload is harmless: the real request will try again */
  });
}
