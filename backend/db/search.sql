-- The query behind GET /api/stocks/search?q=…
-- Give it to the backend as a parameterised query; $1 is the user's text.
--
-- word_similarity(query, text) asks "how well does the query match SOME WORD
-- inside the text", which is what you want for "lmn bro" vs "Lehman Brothers".
-- A plain similarity() would be dragged down by the rest of the string.
--
-- Scoring: an exact ticker beats a ticker prefix, which beats a fuzzy match.
-- Tickers are weighted above company names, since people usually type those.
SELECT
    ticker,
    name,
    delisted_on IS NOT NULL AS delisted
FROM stocks
WHERE
    $1 = ''
    OR ticker ILIKE $1 || '%'
    OR word_similarity($1, ticker) > 0.4
    OR word_similarity($1, name)   > 0.3
ORDER BY
    CASE
        WHEN upper($1) = ticker          THEN 0   -- exact ticker first
        WHEN ticker ILIKE $1 || '%'      THEN 1   -- then ticker prefixes
        ELSE 2
    END,
    GREATEST(
        word_similarity($1, ticker) * 1.5,        -- tickers outrank names
        word_similarity($1, name)
    ) DESC,
    ticker
LIMIT 25;
