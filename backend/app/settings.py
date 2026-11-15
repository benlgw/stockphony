"""
Every setting the backend reads, in one place.

Values come from backend/.env (or real environment variables, which win).
Each has a default, so the only things you must set are the Alpaca keys,
and even those are optional with PRICE_SOURCE=fake.
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv

# backend/ — this file is backend/app/settings.py, so two levels up.
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://composer:composer@localhost:5432/stocks")

# Where prices come from:
#   "alpaca" — real market data. Needs ALPACA_API_KEY and ALPACA_SECRET_KEY.
#   "fake"   — generated prices. No keys, no internet. For working offline,
#              or as a fallback if the demo venue's wifi dies.
PRICE_SOURCE = os.getenv("PRICE_SOURCE", "alpaca").strip().lower()

ALPACA_API_KEY = os.getenv("ALPACA_API_KEY", "")
ALPACA_SECRET_KEY = os.getenv("ALPACA_SECRET_KEY", "")

# "sip" is every US exchange combined; "iex" is one exchange. The free plan
# allows SIP for history as long as the request avoids the last 15 minutes,
# which ours always does. If Alpaca refuses SIP anyway, prices.py retries on IEX.
ALPACA_FEED = os.getenv("ALPACA_FEED", "sip").strip().lower()

# Alpaca's stock history starts in 2016, so asking for earlier gains nothing.
HISTORY_START = date(2016, 1, 1)

# How long fetched prices count as fresh before being fetched again. A day is
# plenty: the music uses weekly steps, so one new day barely changes anything.
CACHE_MAX_AGE_HOURS = float(os.getenv("CACHE_MAX_AGE_HOURS", "24"))

# How many of the top search results to fetch in the background, so the stock
# a user is most likely to drag in is already cached when they do.
PRELOAD_TOP_N = int(os.getenv("PRELOAD_TOP_N", "3"))

# Trading days squashed into one musical step. 5 is roughly a week, which turns
# ten years of history into ~500 steps: about two minutes of music at 120 BPM.
DAYS_PER_STEP = 5
