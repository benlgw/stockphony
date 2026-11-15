"""
Daily closing prices, from Alpaca or a fake generator, cached in Postgres.

The rule is simple: ask the cache first; only fetch when the cache is missing
or stale. Everything else in the backend calls get_daily_closes() and never
talks to Alpaca directly.
"""

from __future__ import annotations

import hashlib
import logging
import random
import threading
from datetime import date, datetime, timedelta, timezone

from . import db, settings

log = logging.getLogger("stockphony.prices")


class NoPriceData(Exception):
    """The source has no history for this ticker (e.g. delisted before 2016)."""


class PriceSourceError(Exception):
    """The source failed: bad keys, rate limit, no internet... Worth retrying."""


# ---------------------------------------------------------------------------
# One lock per ticker.
#
# A search preloads NVDA in the background; a moment later the user drags NVDA
# in and the frontend asks for its history. Without a lock, both would fetch it
# from Alpaca at once. With one, the second waits for the first, then finds it
# in the cache.
# ---------------------------------------------------------------------------
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(ticker: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(ticker, threading.Lock())


def get_daily_closes(ticker: str) -> list[tuple[date, float]]:
    """
    Every daily close for a ticker since 2016, oldest first.
    Raises NoPriceData or PriceSourceError.
    """
    ticker = ticker.strip().upper()
    with _lock_for(ticker):
        cached = db.read_cached_prices(ticker)
        if cached is not None:
            fetched_at, closes = cached
            age = datetime.now(timezone.utc) - fetched_at
            if age < timedelta(hours=settings.CACHE_MAX_AGE_HOURS):
                if not closes:
                    raise NoPriceData(ticker)
                return closes

        try:
            closes = _fetch(ticker)
        except PriceSourceError:
            # Stale data beats an error. This is what keeps the demo working
            # if the wifi drops: anything fetched before still plays.
            if cached is not None and cached[1]:
                log.warning("Refresh of %s failed; serving cached prices", ticker)
                return cached[1]
            raise

        db.write_cached_prices(ticker, closes)
        if not closes:
            raise NoPriceData(ticker)
        return closes


def preload(tickers: list[str]) -> None:
    """Warms the cache. Runs in the background, so it logs failures, never raises."""
    for ticker in tickers:
        try:
            get_daily_closes(ticker)
        except NoPriceData:
            pass  # recorded in the cache; search hides it from now on
        except Exception:
            log.exception("Preloading %s failed", ticker)


def _fetch(ticker: str) -> list[tuple[date, float]]:
    log.info("Fetching %s from %s", ticker, settings.PRICE_SOURCE)
    if settings.PRICE_SOURCE == "fake":
        return _fake_closes(ticker)
    return _alpaca_closes(ticker)


# ---------------------------------------------------------------------------
# Alpaca
# ---------------------------------------------------------------------------
_client = None


def _alpaca_client():
    # Imported here so PRICE_SOURCE=fake works even without alpaca-py's keys.
    from alpaca.data.historical import StockHistoricalDataClient

    global _client
    if _client is None:
        if not (settings.ALPACA_API_KEY and settings.ALPACA_SECRET_KEY):
            raise PriceSourceError("ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in backend/.env")
        _client = StockHistoricalDataClient(settings.ALPACA_API_KEY, settings.ALPACA_SECRET_KEY)
    return _client


def _alpaca_closes(ticker: str) -> list[tuple[date, float]]:
    from alpaca.common.exceptions import APIError
    from alpaca.data.enums import Adjustment, DataFeed
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame

    # Our stock list comes from the SEC, which writes share classes with a
    # dash (BRK-B). Alpaca uses a dot (BRK.B).
    symbol = ticker.replace("-", ".")

    def request(feed: DataFeed):
        return StockBarsRequest(
            symbol_or_symbols=symbol,
            timeframe=TimeFrame.Day,
            start=datetime.combine(settings.HISTORY_START, datetime.min.time(), timezone.utc),
            # The free plan refuses SIP data from the last 15 minutes.
            end=datetime.now(timezone.utc) - timedelta(minutes=20),
            # Adjusted for splits and dividends. Without this, NVIDIA's 10-for-1
            # split in 2024 shows up as a 90% crash, and sounds like one.
            adjustment=Adjustment.ALL,
            feed=feed,
        )

    feed = DataFeed.IEX if settings.ALPACA_FEED == "iex" else DataFeed.SIP
    try:
        try:
            bars = _alpaca_client().get_stock_bars(request(feed))
        except APIError as error:
            if feed == DataFeed.SIP and "subscription" in str(error).lower():
                log.warning("Alpaca refused SIP data; retrying %s on IEX", ticker)
                bars = _alpaca_client().get_stock_bars(request(DataFeed.IEX))
            else:
                raise
    except APIError as error:
        # 4xx about the symbol itself means "no data", not "try again later".
        if error.status_code in (400, 404, 422):
            log.info("Alpaca has no data for %s: %s", ticker, error)
            return []
        raise PriceSourceError(f"Alpaca error for {ticker}: {error}") from error
    except PriceSourceError:
        raise
    except Exception as error:  # network down, DNS, timeouts...
        raise PriceSourceError(f"Could not reach Alpaca for {ticker}: {error}") from error

    # The SDK follows Alpaca's pagination for us; data maps symbol -> bars.
    # A symbol with no history is simply missing, hence .get().
    return [(bar.timestamp.date(), float(bar.close)) for bar in bars.data.get(symbol, [])]


# ---------------------------------------------------------------------------
# Fake prices
# ---------------------------------------------------------------------------

def _fake_closes(ticker: str) -> list[tuple[date, float]]:
    """
    A believable random walk, one close per weekday since 2016.

    Seeded from the ticker with hashlib (not hash(), which changes every time
    Python starts), so each ticker always gets the same made-up history.
    """
    rng = random.Random(int(hashlib.sha256(ticker.encode()).hexdigest()[:12], 16))
    drift = rng.uniform(-0.0002, 0.0009)
    volatility = rng.uniform(0.01, 0.035)
    price = rng.uniform(10, 200)

    closes: list[tuple[date, float]] = []
    day = settings.HISTORY_START
    today = date.today()
    while day < today:
        if day.weekday() < 5:  # skip weekends, like a real market
            price *= 1 + rng.gauss(drift, volatility)
            price = max(price, 0.5)
            closes.append((day, round(price, 2)))
        day += timedelta(days=1)
    return closes
