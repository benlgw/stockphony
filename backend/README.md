# Stockphony backend

A FastAPI REST API. It searches stocks, fetches price history from Alpaca,
caches it in Postgres, and works out when each stock's notes should play.

## Running it

From `backend/`, with Docker running, in this order:

```bash
docker compose up -d                              # 1. the database, first
uv run uvicorn app.main:app --reload --port 8000  # 2. then the API
```

**The database must be running before the API starts.** The API waits up to
10 seconds for it, then stops with:

```
RuntimeError: Can't reach the database at localhost:5432/stocks. Is it running?
```

If you see that, run `docker compose up -d` and start the API again. To check
the database is up, run `docker compose ps`: it should say `healthy`.

On its first start, the API loads the list of about 6,400 stocks from
`db/stocks.csv` by itself. To refresh that list from the SEC later, run
`uv run python scripts/load_stocks.py`.

Then open **http://localhost:8000/docs**: every endpoint, with a "Try it out"
button. The frontend reaches the API through Vite's `/api` proxy, so start
the frontend with `pnpm dev` as usual.

pip users: activate your virtual environment, `pip install -r requirements.txt`,
then run the same `uvicorn` command without `uv run`.

## Settings (backend/.env)

```
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
DATABASE_URL=postgresql://composer:composer@localhost:5432/stocks
SEC_USER_AGENT="Stockphony your.name@example.com"   # only for scripts/load_stocks.py

# Optional
PRICE_SOURCE=fake          # generated prices: no keys, no internet needed
CACHE_MAX_AGE_HOURS=24     # how long fetched prices count as fresh
PRELOAD_TOP_N=3            # search results to preload in the background
```

## How it fits together

```
app/
├── main.py      the endpoints
├── prices.py    Alpaca + the Postgres cache (the only file that talks to Alpaca)
├── music.py     prices -> timed notes; pure functions, easy to experiment with
├── db.py        stock search and the cache tables
├── models.py    the JSON shapes every endpoint returns
├── settings.py  everything read from .env
└── preload.py   fill the cache from the command line
```

**Caching.** Every price fetch is stored in Postgres (`price_history`), so a
stock is only fetched from Alpaca once a day. If a refresh fails, the cached
copy is served instead. Stocks Alpaca has no data for (anything delisted
before 2016, when its history starts) are remembered, and hidden from search.

**Preloading.** Searching preloads the top 3 results in the background, and
the frontend asks for a preload as soon as a stock is picked up to drag. By
the time it's dropped, its prices are usually cached.

## Before a demo: saving stocks for offline use

The backend saves each stock's prices in the database the first time it's
used. To be sure the stocks you want to show are saved *before* you lose
internet, list their tickers after this command:

```bash
uv run python -m app.preload TICKER TICKER ...
```

For example, to save Nvidia, Apple, GameStop and Tesla:

```bash
uv run python -m app.preload NVDA AAPL GME TSLA
```

(pip users: activate your virtual environment and leave out `uv run`.)

- **Use the tickers the app's search shows**, e.g. `BRK-B` for Berkshire
  Hathaway. Upper or lower case both work.
- **Each stock prints one line** saying how many days of prices were saved,
  something like `NVDA  2,733 days, 2016-01-04 to 2026-11-13`. If one says
  `failed`, check your Alpaca keys and internet connection, then run it again.
- **Saved prices work offline for good.** Once they're over a day old, the
  backend tries to refresh them; with no internet, it just keeps using the
  saved copy.
- **Only saved stocks can play offline.** Search still works without internet
  (the company list lives in the database), but a stock that was never saved
  needs a connection the first time it's added.

## Database

```bash
uv run python scripts/load_stocks.py    # refresh the stock list from the SEC (optional)
docker compose exec db psql -U composer -d stocks
```
