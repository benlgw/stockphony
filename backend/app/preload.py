"""
Fill the price cache ahead of time, from the command line:

    uv run python -m app.preload NVDA AAPL GME TSLA

Worth running the night before the demo with every stock you plan to show.
Once cached, they play even if the venue's wifi is down.
"""

from __future__ import annotations

import sys

from . import db, prices


def main() -> None:
    tickers = [t.upper() for t in sys.argv[1:]]
    if not tickers:
        sys.exit("Usage: python -m app.preload TICKER [TICKER ...]")

    db.ensure_schema()
    for ticker in tickers:
        try:
            closes = prices.get_daily_closes(ticker)
            print(f"{ticker:6} {len(closes):,} days, {closes[0][0]} to {closes[-1][0]}")
        except prices.NoPriceData:
            print(f"{ticker:6} no price history available")
        except prices.PriceSourceError as error:
            print(f"{ticker:6} failed: {error}")


if __name__ == "__main__":
    main()
