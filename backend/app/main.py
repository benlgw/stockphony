"""
The Stockphony REST API.

Run it from backend/:
    uv run uvicorn app.main:app --reload --port 8000

Then open http://localhost:8000/docs to try every endpoint in the browser.

Endpoints
---------
GET  /api/health                      is the backend up, and can it reach Postgres?
GET  /api/stocks/search?q=nvdia       typo-tolerant search; preloads the top results
POST /api/stocks/{ticker}/preload     fetch and cache a stock's prices in the background
GET  /api/stocks/{ticker}/history     weekly prices for the chart
GET  /api/stocks/{ticker}/notes       when to play which notes, for one section/key/bpm
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import db, music, prices, settings
from .models import Health, History, NoteSchedule, Point, StockInfo

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once at startup: make sure the price cache tables exist.
    db.ensure_schema()
    yield


app = FastAPI(title="Stockphony API", lifespan=lifespan)

# The frontend normally reaches us through Vite's /api proxy (same origin, so
# no CORS needed). This also allows calling the API directly from the dev server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Note on `def` vs `async def`: every endpoint here is a plain `def`, because
# psycopg and the Alpaca SDK block while they wait. FastAPI runs plain `def`
# endpoints on a thread pool, so a slow Alpaca fetch never freezes other requests.


@app.get("/api/health", response_model=Health)
def health() -> Health:
    try:
        with db.connect() as conn:
            conn.execute("SELECT 1")
        database = True
    except Exception:
        database = False
    return Health(ok=database, price_source=settings.PRICE_SOURCE, database=database)


@app.get("/api/stocks/search", response_model=list[StockInfo])
def search(background: BackgroundTasks, q: str = "") -> list[dict]:
    results = db.search_stocks(q)
    # Preload the stocks the user is most likely to pick, so their prices are
    # cached before they are dragged in. BackgroundTasks run after the response
    # is sent, so the search itself stays fast. Skipped for one-letter queries,
    # which match too much to be worth guessing from.
    if len(q.strip()) >= 2:
        background.add_task(prices.preload, [r["ticker"] for r in results[: settings.PRELOAD_TOP_N]])
    return results


@app.post("/api/stocks/{ticker}/preload", status_code=202)
def preload(ticker: str, background: BackgroundTasks) -> dict:
    background.add_task(prices.preload, [ticker.upper()])
    return {"queued": ticker.upper()}


def _weekly_points(ticker: str) -> list[tuple]:
    """Daily closes squashed to steps, translating errors into HTTP responses."""
    try:
        daily = prices.get_daily_closes(ticker)
    except prices.NoPriceData:
        raise HTTPException(404, f"No price history for {ticker.upper()} (Alpaca's data starts in 2016).")
    except prices.PriceSourceError as error:
        raise HTTPException(502, str(error))
    return music.to_steps(daily, settings.DAYS_PER_STEP)


@app.get("/api/stocks/{ticker}/history", response_model=History)
def history(ticker: str) -> History:
    steps = _weekly_points(ticker)
    return History(
        ticker=ticker.upper(),
        days_per_step=settings.DAYS_PER_STEP,
        points=[Point(date=day, close=close) for day, close in steps],
    )


@app.get("/api/stocks/{ticker}/notes", response_model=NoteSchedule)
def notes(
    ticker: str,
    section: music.SectionId,
    key: music.KeyId = "amin",
    # Up to 2400 because the frontend's leverage buttons multiply a stock's
    # BPM (max 200) by up to 10x, and sends the result.
    bpm: int = Query(120, ge=40, le=2400),
) -> NoteSchedule:
    # Section and key are Literal types, so FastAPI rejects anything else with
    # a 422 before this code runs, and /docs shows them as dropdowns.
    steps = _weekly_points(ticker)
    schedule = music.build_schedule([close for _, close in steps], section, key, bpm)
    return NoteSchedule(ticker=ticker.upper(), **schedule)
