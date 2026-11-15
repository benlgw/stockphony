# Stockphony frontend

The Svelte 5 + TypeScript app: the mixing desk you see in the browser, and the
sound engine that plays it.

## Running it

The backend must be running first (see [`../backend/README.md`](../backend/README.md)).

```bash
pnpm install
pnpm dev
```

Then open http://localhost:5173. Requests to `/api` are forwarded to the
backend on port 8000 by Vite (see `vite.config.ts`).

| Command | Does |
|---|---|
| `pnpm dev` | Development server with hot reload |
| `pnpm check` | Type-check everything |
| `pnpm build` | Production build into `dist/` |

## Where things are

```
src/
├── App.svelte             starts everything up
├── app.css                colours and fonts, light and dark mode
└── lib/
    ├── core/              shared definitions
    │   ├── sections.ts    the sections and which instruments each offers
    │   ├── types.ts       data shapes, matching the backend's API
    │   └── config.ts      settings: tempo limits, leverage options
    ├── services/          talking to the outside world
    │   ├── api.ts         calls to the backend
    │   ├── audio.ts       every instrument and how it sounds (Tone.js)
    │   ├── scheduler.ts   plays each stock's notes on time, looping
    │   └── search.ts      stock search
    ├── state/
    │   └── studio.svelte.ts   the app's state: the mix, charts, playback
    ├── Header.svelte
    └── Main/              the sections, stock cards and control panel
```

**To add an instrument:** define its sound in `services/audio.ts`, then add its
name to a section's list in `core/sections.ts`. The first instrument in each
list is the one new stocks start with.

**Recorded instruments** live in `public/samples/`. See
[`public/samples/CREDITS.md`](public/samples/CREDITS.md) for their source and licence.

## Settings (`.env`, optional)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | empty | Where the backend is. Empty means the same site, through the `/api` proxy. |
