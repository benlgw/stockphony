import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame
from alpaca.data.enums import DataFeed

print("Starting Alpaca test...")

# Load API keys
load_dotenv()

api_key = os.getenv("ALPACA_API_KEY")
secret_key = os.getenv("ALPACA_SECRET_KEY")

if not api_key or not secret_key:
    raise ValueError("API keys not found. Check your .env file.")

print("API keys found.")

# Connect to Alpaca
client = StockHistoricalDataClient(api_key, secret_key)

# Request NVIDIA stock prices
request = StockBarsRequest(
    symbol_or_symbols=["NVDA"],
    timeframe=TimeFrame.Day,
    start=datetime(2025, 1, 1, tzinfo=timezone.utc),
    end=datetime.now(timezone.utc),
    feed=DataFeed.IEX
)

print("Requesting stock prices...")

# Get the data
stock_data = client.get_stock_bars(request)

print("Stock data received!")
print(stock_data.df)
