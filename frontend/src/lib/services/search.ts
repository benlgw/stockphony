/**
 * Stock search.
 *
 * The matching itself happens in Postgres (pg_trgm), not here. The frontend's
 * job is to debounce keystrokes, call the endpoint and cancel stale requests.
 * The backend also starts preloading the top results' prices when it answers.
 */

import { API_URL } from "$lib/core/config";
import type { StockInfo } from "$lib/core/types";

/**
 * GET /api/stocks/search?q=nvdia
 *   -> [{ "ticker": "NVDA", "name": "Nvidia Corp", "delisted": false }, ...]
 *
 * `signal` lets a newer keystroke abort an in-flight request, so results
 * cannot arrive out of order and overwrite newer ones.
 */
export async function searchStocks(query: string, signal?: AbortSignal): Promise<StockInfo[]> {
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
