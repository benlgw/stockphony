-- A few well-known stocks, so search works straight away. Run
-- scripts/load_stocks.py afterwards to load every US-listed stock.
INSERT INTO stocks (ticker, name, delisted_on) VALUES
    ('AAPL', 'Apple',            NULL),
    ('MSFT', 'Microsoft',        NULL),
    ('NVDA', 'Nvidia',           NULL),
    ('TSLA', 'Tesla',            NULL),
    ('AMZN', 'Amazon',           NULL),
    ('GOOGL','Alphabet',         NULL),
    ('XOM',  'ExxonMobil',       NULL),
    ('JPM',  'JPMorgan Chase',   NULL),
    ('GME',  'GameStop',         NULL),
    ('PLTR', 'Palantir',         NULL)
ON CONFLICT (ticker) DO NOTHING;
