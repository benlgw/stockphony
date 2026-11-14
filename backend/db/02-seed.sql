-- A few rows to develop against. Replace with a full ticker list before the demo:
-- \copy stocks(ticker, name, delisted_on) FROM 'tickers.csv' WITH (FORMAT csv, HEADER true)
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
    ('PLTR', 'Palantir',         NULL),
    ('LEH',  'Lehman Brothers',  '2008-09-16'),
    ('ENE',  'Enron',            '2001-11-28'),
    ('BBI',  'Blockbuster',      '2010-07-01'),
    ('BSC',  'Bear Stearns',     '2008-05-30')
ON CONFLICT (ticker) DO NOTHING;
