"""
Database access: stock search, plus the price cache tables.

Connections are opened per call. For a local database that costs a millisecond
or two, and it avoids the shared state of a connection pool, which keeps this
file simple for a hackathon.
"""

from __future__ import annotations

from datetime import date, datetime

import psycopg
from psycopg.rows import dict_row

from . import settings

# The price cache. Created on startup with IF NOT EXISTS, rather than in
# db/01-schema.sql, because Postgres only runs those files when the database
# volume is first created, and everyone's volume already exists.
SCHEMA = """
CREATE TABLE IF NOT EXISTS price_history (
    ticker TEXT   NOT NULL,
    day    DATE   NOT NULL,
    close  DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (ticker, day)
);

-- One row per ticker we have asked the price source about. bar_count = 0
-- records that it had NO data (e.g. Lehman, delisted before Alpaca's 2016
-- start), so we don't keep asking, and can hide it from search.
CREATE TABLE IF NOT EXISTS price_fetches (
    ticker     TEXT PRIMARY KEY,
    fetched_at TIMESTAMPTZ NOT NULL,
    bar_count  INTEGER NOT NULL
);
"""


def connect() -> psycopg.Connection:
    return psycopg.connect(settings.DATABASE_URL, row_factory=dict_row)


def ensure_schema() -> None:
    with connect() as conn:
        conn.execute(SCHEMA)


def _load_search_query() -> str:
    """
    Reads db/search.sql, so the query lives in one file.

    That file uses Postgres's own placeholder, $1. psycopg uses %(name)s
    instead, and treats any other % as the start of a placeholder, so the
    literal % signs in the LIKE patterns are doubled first.
    """
    sql = (settings.BACKEND_DIR / "db" / "search.sql").read_text()
    return sql.replace("%", "%%").replace("$1", "%(q)s").strip().rstrip(";")


SEARCH_SQL = _load_search_query()


POPULAR_SQL = """
    SELECT ticker, name, delisted_on IS NOT NULL AS delisted
    FROM stocks
    WHERE ticker = ANY(%(tickers)s)
    ORDER BY array_position(%(tickers)s, ticker)   -- keep the list's order
"""


def search_stocks(query: str) -> list[dict]:
    query = query.strip()
    with connect() as conn:
        if query:
            rows = conn.execute(SEARCH_SQL, {"q": query}).fetchall()
        else:
            # An empty box shows well-known stocks rather than the whole table.
            rows = conn.execute(POPULAR_SQL, {"tickers": settings.POPULAR_TICKERS}).fetchall()
        if not rows:
            return []
        # Hide stocks we already know have no price history: in the demo, a
        # stock that can be dragged in but never plays is a dead end.
        empty = conn.execute(
            "SELECT ticker FROM price_fetches WHERE bar_count = 0 AND ticker = ANY(%s)",
            [[r["ticker"] for r in rows]],
        ).fetchall()
    hidden = {r["ticker"] for r in empty}
    return [r for r in rows if r["ticker"] not in hidden]


# ---- price cache ----

def read_cached_prices(ticker: str) -> tuple[datetime, list[tuple[date, float]]] | None:
    """(when it was fetched, daily closes), or None if never fetched."""
    with connect() as conn:
        fetch = conn.execute(
            "SELECT fetched_at FROM price_fetches WHERE ticker = %s", [ticker]
        ).fetchone()
        if fetch is None:
            return None
        rows = conn.execute(
            "SELECT day, close FROM price_history WHERE ticker = %s ORDER BY day", [ticker]
        ).fetchall()
    return fetch["fetched_at"], [(r["day"], r["close"]) for r in rows]


def write_cached_prices(ticker: str, closes: list[tuple[date, float]]) -> None:
    """Replaces a ticker's cached history in one transaction."""
    with connect() as conn:
        # The `with` block commits at the end, or rolls back on error, so a
        # crash halfway through can't leave half a history behind.
        conn.execute("DELETE FROM price_history WHERE ticker = %s", [ticker])
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO price_history (ticker, day, close) VALUES (%s, %s, %s)",
                [(ticker, day, close) for day, close in closes],
            )
        conn.execute(
            """
            INSERT INTO price_fetches (ticker, fetched_at, bar_count)
            VALUES (%s, now(), %s)
            ON CONFLICT (ticker) DO UPDATE
                SET fetched_at = EXCLUDED.fetched_at, bar_count = EXCLUDED.bar_count
            """,
            [ticker, len(closes)],
        )
