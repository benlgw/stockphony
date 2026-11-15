# Stockphony

**A symphony from stock data.** Built at DurHack 2026 for the theme *Composition*.

Stockphony turns real stock price history into music. Drag a company into the
mix and its last ten years of prices become a part in the song: when the price
rises, the notes rise; when it crashes, the music falls with it. Combine
stocks like you would a portfolio, and you're composing in both senses.

<!-- Live demo: add the link here once it's hosted -->

## How it works

1. **Search** for any US-listed company by name or ticker. Search is typo-tolerant: "nvdia" finds Nvidia.
2. **Drag** it into a section. Each section turns the price history into music in its own way:

   | Section | What it plays |
   |---|---|
   | Piano, Synth | The tune: the price line becomes the melody |
   | Guitar | Picks through chords that follow the price |
   | Bass | A smoothed bass line from the average price |
   | Drums | A steady beat, with extra hits on busy weeks |
   | Chords | Long chords underneath everything |
   | Volatility | Silent until the price jumps sharply |

3. **Press play.** Each stock loops through its whole history, one week per beat-step.

Every stock has its own instrument, key, tempo and volume, plus a **leverage**
button that multiplies its tempo by 2×, 5× or 10×.

## Tech stack

- **Frontend:** Svelte 5, TypeScript, Vite, Tone.js for sound
- **Backend:** Python, FastAPI, Alpaca market data API
- **Database:** PostgreSQL (in Docker), with trigram matching for typo-tolerant search

The backend fetches each stock's daily prices from Alpaca, caches them in
Postgres, and works out exactly when every note should play. The frontend
plays those notes on the browser's audio clock, so the timing stays tight.

## Running it locally

You'll need Docker, Python 3.11+ (with uv or pip), Node with pnpm, and a free
[Alpaca](https://alpaca.markets) account for market data keys.

1. **Backend:** follow [`backend/README.md`](backend/README.md) to start the database and the API.
2. **Frontend:** follow [`frontend/README.md`](frontend/README.md), then open http://localhost:5173.

## Hosting

The repo deploys to [Render](https://render.com) as a Blueprint
(`render.yaml`): one web service that serves both the API and the frontend,
plus a Postgres database. In Render, choose **New → Blueprint**, pick this
repo, enter the Alpaca keys when asked, and apply. On its first start, the app
creates its tables and loads the stock list by itself.

## Credits

- **Instrument samples:** the recorded instruments (guitars, piano, organ, cello, saxophone, trumpet and others) are from [tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) by Nicholas Brosowsky, licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). We include a subset of the notes, re-encoded to smaller files.
- **Market data:** [Alpaca](https://alpaca.markets).
- **Company list:** the SEC's public [company ticker list](https://www.sec.gov/files/company_tickers_exchange.json).

## Licence

Code licensed under the GNU GPL v3; see [`LICENSE`](LICENSE). The instrument
samples keep their own CC BY 3.0 licence.
