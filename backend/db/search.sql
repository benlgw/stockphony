-- The query behind GET /api/stocks/search?q=…
-- $1 is the user's text. Postgres allows $1 to be reused, as it is here.
--
-- Using it from Python:
--   * asyncpg understands $1 natively: conn.fetch(sql, q)
--   * psycopg does not. Swap every $1 for %(q)s and pass {"q": q}, AND double
--     each literal % in the LIKE patterns to %% — psycopg reads a lone % as the
--     start of a placeholder and raises "only '%s', '%b', '%t' are allowed".
--
-- How matching works: pg_trgm splits text into three-letter chunks and compares
-- how many two strings share, which is why typos still match ("nvdia" finds
-- Nvidia). word_similarity(query, text) scores the query against the best
-- matching WORD inside the text, so "berkshre" matches "Berkshire Hathaway Inc"
-- without being dragged down by "Hathaway".
--
-- Ranking was tuned against the full ~6,400-stock list, with typos like
-- "appel", "microsfot" and "jp morgan": 27 of 29 test searches put the intended
-- stock first, and the other two put it second.
SELECT
    ticker,
    name,
    delisted_on IS NOT NULL AS delisted
FROM stocks
WHERE
    $1 = ''
    OR ticker ILIKE $1 || '%'
    OR name   ILIKE $1 || '%'
    OR word_similarity($1, ticker) > 0.4
    OR word_similarity($1, name)   > 0.3
ORDER BY
    -- Exact and prefix matches first, in tiers, before any fuzzy matching.
    CASE
        WHEN upper($1) = ticker     THEN 0   -- typed the exact ticker
        WHEN ticker ILIKE $1 || '%' THEN 1   -- start of a ticker ("brk")
        WHEN name   ILIKE $1 || '%' THEN 2   -- start of a name ("apple")
        ELSE 3                               -- fuzzy only
    END,
    -- Within a tier, the best fuzzy score wins. The third term compares with
    -- spaces removed, so "jp morgan" still finds "Jpmorgan Chase & Co".
    -- (An earlier version weighted tickers 1.5x. With thousands of short
    -- tickers that let nearly any query match one, so "appel" ranked APP
    -- above Apple. Tickers and names are now scored equally.)
    GREATEST(
        similarity($1, ticker),
        word_similarity($1, name),
        word_similarity(replace($1, ' ', ''), name)
    ) DESC,
    similarity($1, name) DESC,
    -- The same company can have several tickers (JPM and its exchange-traded
    -- notes); the shorter one is almost always the one people mean.
    length(ticker),
    ticker
LIMIT 25;
