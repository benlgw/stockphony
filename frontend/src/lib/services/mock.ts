/**
 * Demo-only data, used when VITE_USE_MOCK=true.
 *
 * It exists so the UI can be shown, clicked through and styled before the
 * Python backend is ready. None of this runs when mock mode is off, and
 * nothing else in the app imports it except the search service and studio state.
 */

import type { Point, StockInfo } from "$lib/core/types";

export const MOCK_STOCKS: StockInfo[] = [
  { ticker: 'AAPL', name: 'Apple', delisted: false },
  { ticker: 'MSFT', name: 'Microsoft', delisted: false },
  { ticker: 'NVDA', name: 'Nvidia', delisted: false },
  { ticker: 'TSLA', name: 'Tesla', delisted: false },
  { ticker: 'AMZN', name: 'Amazon', delisted: false },
  { ticker: 'XOM', name: 'ExxonMobil', delisted: false },
  { ticker: 'GME', name: 'GameStop', delisted: false },
  { ticker: 'PLTR', name: 'Palantir', delisted: false },
  { ticker: 'JPM', name: 'JPMorgan Chase', delisted: false },
  { ticker: 'LEH', name: 'Lehman Brothers', delisted: true },
  { ticker: 'ENE', name: 'Enron', delisted: true },
  { ticker: 'BBI', name: 'Blockbuster', delisted: true },
];

/**
 * Scores how well a query matches some text, as an in-order subsequence.
 * Returns -1 when it does not match at all. Letters that follow straight on,
 * and letters at the start of a word, score higher, so "lmn bro" finds
 * "Lehman Brothers".
 *
 * This is ONLY the mock-mode stand-in. Real search is pg_trgm in Postgres,
 * which also handles transposed and missing letters properly.
 */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.toLowerCase().replace(/\s+/g, '');
  const haystack = text.toLowerCase();
  if (!needle) return 0;

  let from = 0;
  let score = 0;
  let streak = 0;
  for (const char of needle) {
    const at = haystack.indexOf(char, from);
    if (at < 0) return -1;
    streak = at === from ? streak + 1 : 0;
    const startsWord = at === 0 || haystack[at - 1] === ' ';
    score += 1 + streak * 2 + (startsWord ? 3 : 0);
    from = at + 1;
  }
  return score;
}

export function mockSearch(query: string): StockInfo[] {
  if (!query.trim()) return MOCK_STOCKS;
  return MOCK_STOCKS.map((stock) => ({
    stock,
    // A ticker match counts for more than a company-name match.
    score: Math.max(fuzzyScore(query, stock.ticker) * 1.5, fuzzyScore(query, stock.name)),
  }))
    .filter((row) => row.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.stock);
}

/**
 * Generates a believable-looking price history.
 * Built in log space so it compounds like a real share price, then shifted
 * so the last value is a sensible number.
 */
export function mockHistory(ticker: string, years = 18): Point[] {
  let seed = 0;
  for (let i = 0; i < ticker.length; i++) seed += ticker.charCodeAt(i) * (i + 3);

  const count = Math.round(years * 52); // weekly points
  const doomed = ['LEH', 'ENE', 'BBI'].includes(ticker);
  const points: Point[] = [];
  const end = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    let logPrice =
      Math.log(25) +
      t * 2.2 +
      Math.sin(seed + t * 11) * 0.3 +
      Math.sin(seed * 1.7 + t * 37) * 0.1 +
      Math.sin(seed * 3 + i * 1.3) * 0.04;
    // The delisted ones fall off a cliff near the end.
    if (doomed && t > 0.86) logPrice -= ((t - 0.86) / 0.14) ** 2 * 6;

    points.push({
      date: new Date(end - (count - 1 - i) * weekMs).toISOString().slice(0, 10),
      close: Number(Math.exp(logPrice).toFixed(2)),
    });
  }
  return points;
}
