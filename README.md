# SheetTrader Pro 📊
### Spreadsheet-Style Paper Trading Portal with Real-Time `yfinance`

An interactive, responsive spreadsheet-based paper trading workbook designed to track active stock holdings, watchlists, and past trade history with real-time quote updates and in-cell formulas.

---

## ✨ Features

- **📑 Active Portfolio Grid (Main Sheet):**
  - **In-Cell Editing**: Modify your Buy Price or Quantity directly within table cells; all calculations update immediately.
  - **Auto Formulas**: Invested Cost, Current Market Value, Unrealized P&L ($), Return %, and Day Change %.
  - **Live Tick Animations**: Flashes green (tick up) and red (tick down) on real-time price updates.
  - **📈 30-Day Sparklines**: Embedded SVG historical price trend charts for each holding.
  - **Actions**: Quick buy more, sell/close position, and delete.

- **⭐ Watchlist Sheet:**
  - Star toggle directly on any portfolio row or add custom tickers to monitor.
  - Set **Target Buy Prices** with visual indicator alerts when live market prices hit your buy target.
  - **52-Week Range**: Progress bar showing where the current price sits between 52-week low and high.

- **📜 Past Trade History Sheet:**
  - Permanent closed trades ledger tracking Buy Price/Date, Sell Price/Date, Shares Sold, Realized P&L ($), ROI %, and Holding Duration (in days).
  - Calculates all-time Win Rate % and Realized Profit.

- **💵 Virtual Cash & Buying Power Management:**
  - Starting virtual cash balance ($100,000 default).
  - Buys deduct cash; Sells credit cash back plus realized profit/loss.

- **📥 CSV Data Export & Persistence:**
  - Export your entire multi-sheet portfolio to CSV.
  - Automatically saves state to your browser's `localStorage`.

---

## 🚀 How to Run

### Option 1: Live `yfinance` Mode (Recommended)
Run the built-in Python server to fetch real-time market quotes:

```bash
cd paper-trading-spreadsheet
python server.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser.

### Option 2: Standalone Browser Mode
Double click or open `index.html` directly in any web browser. The app runs with an integrated market simulator if the Python backend is offline.
