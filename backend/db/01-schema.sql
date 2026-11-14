-- Fuzzy stock search.
--
-- pg_trgm breaks text into three-letter chunks ("trigrams") and compares how
-- many two strings share. That is what makes it tolerant of typos: "nvdia"
-- and "nvidia" share nearly all their trigrams, so one still finds the other.
-- A LIKE '%...%' query could not do that, and would also be unable to use an index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS stocks (
    ticker      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    -- NULL means still trading. A date means it stopped, which the UI badges.
    delisted_on DATE
);

-- GIN trigram indexes, one per searchable column. Without these, every search
-- scans the whole table; with them Postgres can jump straight to likely matches.
CREATE INDEX IF NOT EXISTS stocks_ticker_trgm ON stocks USING gin (ticker gin_trgm_ops);
CREATE INDEX IF NOT EXISTS stocks_name_trgm   ON stocks USING gin (name   gin_trgm_ops);
