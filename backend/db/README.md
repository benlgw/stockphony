# Stock database

Postgres with `pg_trgm` for typo-tolerant search. Docker keeps it identical on
macOS, Windows and Linux.

## Run it

```bash
docker compose up -d        # start
docker compose logs -f db   # watch it come up
docker compose down         # stop
docker compose down -v      # stop AND wipe data, so the SQL in db/ re-runs
```

Connection string for the backend:

```
postgresql://composer:composer@localhost:5432/stocks
```

The files in this folder only run when the data volume is empty. After editing
them, use `docker compose down -v` to apply the changes.

## Try a search by hand

```bash
docker compose exec db psql -U composer -d stocks \
  -c "SELECT ticker, name FROM stocks WHERE word_similarity('lmn bro', name) > 0.3;"
```

## Tuning

If typos are not being caught, lower the thresholds in `search.sql` (0.3 is
fairly strict). If unrelated results creep in, raise them.
