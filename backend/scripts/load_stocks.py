"""
Load every US-listed stock's ticker and company name into the `stocks` table.

Where the data comes from
-------------------------
The SEC publishes one file mapping every listed company to its ticker:
https://www.sec.gov/files/company_tickers_exchange.json

Using a single source matters for search: each row in that file pairs a ticker
with the company it belongs to, so the two can never drift apart the way they
could if names and tickers came from different places.

The file only covers companies trading today. Delisted ones (Lehman, Enron...)
come from db/02-seed.sql instead, and this script never touches those rows.

Running it
----------
    cd backend
    pip install "psycopg[binary]"
    SEC_USER_AGENT="Stockphony your.name@example.com" python scripts/load_stocks.py

The SEC rejects requests without a User-Agent naming who is asking (it returns
403 Forbidden), so SEC_USER_AGENT is required. Any name plus an email works.

It is safe to run repeatedly: existing tickers are updated, new ones added.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Iterator
from pathlib import Path

import psycopg
from dotenv import load_dotenv

# Read settings from backend/.env. The path is built from this file's location,
# so it works whichever folder you run the script from. Variables already set
# in the terminal win over the file, so a one-off override still works.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json"

# Matches backend/docker-compose.yml. Override with the DATABASE_URL env var.
DEFAULT_DATABASE_URL = "postgresql://composer:composer@localhost:5432/stocks"

# OTC ("over the counter") is left out by default: about 2,500 thinly traded
# penny stocks that most price-history APIs don't cover. --include-otc adds them.
MAIN_EXCHANGES = {"Nasdaq", "NYSE", "CBOE"}

# Exchanges list more than ordinary shares under a company's name: preferred
# shares, warrants, units and rights. They would flood the search with near
# duplicates ("BAC-PB", "BAC-PE", ...), so they are filtered out.
#
# On NYSE these get a dash suffix: -PA, -PB (preferred), -WT (warrants),
# -UN (units), -RI (rights). Share classes like BRK-B and BF-B are kept.
DASH_SUFFIX_NOT_ORDINARY = re.compile(r"-(P[A-Z]?|WT|WS|UN|U|RI|RT|R)$")

# Nasdaq instead uses a 5th letter: W warrants, U units, R rights, and
# M/N/O/P for preferred shares. (GOOGL keeps its L, which means something else.)
NASDAQ_FIFTH_LETTER_NOT_ORDINARY = set("WURMNOP")


def fetch_sec_listings(user_agent: str) -> Iterator[tuple[str, str, str | None]]:
    """Yields (ticker, company name, exchange) for every row in the SEC file."""
    request = urllib.request.Request(
        SEC_URL,
        headers={"User-Agent": user_agent, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        if error.code == 403:
            sys.exit("The SEC refused the request (403). Check SEC_USER_AGENT has a name and email.")
        raise

    # The file is {"fields": ["cik", "name", "ticker", "exchange"], "data": [[...], ...]}.
    # Columns are looked up by name, so a reordering on the SEC's side can't
    # silently put company names in the ticker column.
    column = {field: i for i, field in enumerate(payload["fields"])}
    for row in payload["data"]:
        yield row[column["ticker"]], row[column["name"]], row[column["exchange"]]


def is_ordinary_share(ticker: str, exchange: str | None) -> bool:
    if DASH_SUFFIX_NOT_ORDINARY.search(ticker):
        return False
    if exchange == "Nasdaq" and len(ticker) == 5 and ticker[-1] in NASDAQ_FIFTH_LETTER_NOT_ORDINARY:
        return False
    return True


def tidy_name(name: str) -> str:
    """
    The SEC writes many names in capitals ("NVIDIA CORP"). Those are title-cased
    so the search results don't shout, while words like "AT&T" or "3M" are left
    as they are. Names that already have mixed case ("Apple Inc.") are untouched.
    """
    name = " ".join(name.split())  # collapse stray double spaces
    if name != name.upper():
        return name
    return " ".join(
        word.capitalize() if word.strip(".,").isalpha() else word
        for word in name.split()
    )


def build_rows(
    listings: Iterator[tuple[str, str, str | None]], include_otc: bool
) -> tuple[dict[str, str], Counter[str]]:
    """Filters the SEC listings down to {ticker: name}, counting what was skipped and why."""
    exchanges = MAIN_EXCHANGES | ({"OTC"} if include_otc else set())
    rows: dict[str, str] = {}
    skipped: Counter[str] = Counter()

    for ticker, name, exchange in listings:
        if not ticker or not name:
            skipped["missing ticker or name"] += 1
            continue
        ticker = ticker.strip().upper()

        if exchange not in exchanges:
            skipped[f"exchange {exchange or 'unknown'}"] += 1
        elif not is_ordinary_share(ticker, exchange):
            skipped["warrant, unit, right or preferred"] += 1
        else:
            # A dict keyed on ticker, so each ticker appears exactly once
            # even if the source ever repeats one.
            rows[ticker] = tidy_name(name)

    return rows, skipped


# ON CONFLICT turns the insert into an update for tickers already in the table,
# which is what makes re-running the script safe. delisted_on is reset to NULL
# because anything in the SEC file is, by definition, trading today.
UPSERT = """
    INSERT INTO stocks (ticker, name, delisted_on)
    VALUES (%s, %s, NULL)
    ON CONFLICT (ticker) DO UPDATE
        SET name = EXCLUDED.name,
            delisted_on = NULL
"""


def save(rows: dict[str, str], database_url: str) -> tuple[int, int]:
    """Writes the rows in one transaction. Returns (row count before, row count after)."""
    # The `with` block commits on success and rolls back on any error, so a
    # failure halfway through never leaves the table half-loaded.
    with psycopg.connect(database_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM stocks")
        before = cur.fetchone()[0]

        # executemany sends all ~7,500 rows in a pipeline rather than one round
        # trip per row, so this takes a second or two rather than a minute.
        cur.executemany(UPSERT, list(rows.items()))

        cur.execute("SELECT count(*) FROM stocks")
        after = cur.fetchone()[0]
    return before, after


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--include-otc", action="store_true", help="also load OTC stocks")
    parser.add_argument("--dry-run", action="store_true", help="fetch and filter, but don't write")
    args = parser.parse_args()

    user_agent = os.environ.get("SEC_USER_AGENT")
    if not user_agent:
        sys.exit('Set SEC_USER_AGENT first, e.g. SEC_USER_AGENT="Stockphony you@example.com"')

    print(f"Fetching {SEC_URL} ...")
    rows, skipped = build_rows(fetch_sec_listings(user_agent), args.include_otc)

    print(f"{len(rows):,} stocks to load.")
    for reason, count in skipped.most_common():
        print(f"  skipped {count:,}: {reason}")

    if args.dry_run:
        for ticker in ["AAPL", "NVDA", "BRK-B", "GME"]:
            print(f"  e.g. {ticker:6} -> {rows.get(ticker, '(not found)')}")
        print("Dry run: nothing written.")
        return

    database_url = os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)
    before, after = save(rows, database_url)
    print(f"Done. {after - before:,} new, {len(rows) - (after - before):,} updated, {after:,} in total.")


if __name__ == "__main__":
    main()
