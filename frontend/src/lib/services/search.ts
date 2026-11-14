/**
 * Stock search.
 *
 * The matching itself happens in Postgres (pg_trgm), not here: the database
 * already holds every ticker, and trigram similarity copes with typos far
 * better than anything short we would write in JS. The frontend's whole job
 * is to debounce keystrokes, call the endpoint and cancel stale requests.
 */

import { API_URL, USE_MOCK } from "$lib/core/config";
import { mockSearch } from "$lib/services/mock";
import type { StockInfo } from "$lib/core/types";

/**
 * GET /api/stocks/search?q=lmn%20bro
 *   -> [{ "ticker": "LEH", "name": "Lehman Brothers", "delisted": true }]
 *
 * `signal` lets a newer keystroke abort an in-flight request, so results
 * cannot arrive out of order and overwrite newer ones.
 */
export async function searchStocks(query: string, signal?: AbortSignal): Promise<StockInfo[]> {
  if (USE_MOCK) return mockSearch(query);

  const url = `${API_URL}/api/stocks/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  return (await response.json()) as StockInfo[];
}

/**
 * Wraps a function so it only runs once the calls stop coming for `delay` ms.
 * Without this, typing "nvidia" fires six requests and the database does six
 * trigram scans for one search.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay = 180,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
