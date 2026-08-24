"""
SheetTrader Pro - yfinance Backend & Static File Server
Supports NSE (.NS), BSE (.BO), and US/Global stocks with smart exchange resolution,
currency detection (INR / USD), 30-day sparkline history, and Server-Side Multi-Device Sync.
"""

import sys
import os
import json
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, HTTPServer
import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PORT = int(os.environ.get('PORT', 8000))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
PORTFOLIO_FILE = os.path.join(DIRECTORY, 'portfolio_db.json')

# In-memory caches to protect against Yahoo Finance rate limiting
QUOTE_CACHE = {}
HISTORY_CACHE = {}
FX_CACHE = {"rate": 86.50, "timestamp": 0}
CACHE_TTL = 15.0  # 15s for live quotes
HIST_CACHE_TTL = 180.0  # 3 minutes for sparklines

class SheetTraderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == '/api/health':
            self.send_json_response({"status": "ok", "service": "SheetTrader NSE/BSE/Global yfinance backend"})
            return

        elif path == '/api/portfolio':
            # Multi-device synchronization endpoint
            portfolio_data = self.load_portfolio()
            self.send_json_response(portfolio_data)
            return

        elif path == '/api/quotes':
            symbols_param = query.get('symbols', [''])[0]
            symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
            quotes = self.fetch_quotes(symbols)
            self.send_json_response(quotes)
            return

        elif path == '/api/history':
            symbols_param = query.get('symbols', [''])[0]
            period = query.get('period', ['1mo'])[0]
            symbols = [s.strip().upper() for s in symbols_param.split(',') if s.strip()]
            history = self.fetch_history(symbols, period)
            self.send_json_response(history)
            return

        elif path == '/api/fx':
            rate = self.fetch_usdinr_rate()
            self.send_json_response({"USDINR": rate})
            return

        # Fallback to static file server (index.html, styles.css, app.js)
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/portfolio':
            # Save portfolio state from any client (PC, mobile, etc.)
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                data = json.loads(body)
                self.save_portfolio(data)
                self.send_json_response({"status": "success", "message": "Portfolio synced to server"})
            except Exception as e:
                print(f"[Error] Failed to save portfolio: {e}", file=sys.stderr)
                self.send_json_response({"status": "error", "message": str(e)}, status_code=400)
            return

        self.send_error(404, "Endpoint not found")

    def load_portfolio(self):
        if os.path.exists(PORTFOLIO_FILE):
            try:
                with open(PORTFOLIO_FILE, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[Warn] Error loading portfolio file: {e}", file=sys.stderr)
        return None

    def save_portfolio(self, data):
        try:
            with open(PORTFOLIO_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"[Error] Error writing portfolio file: {e}", file=sys.stderr)

    def send_json_response(self, data, status_code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def fetch_usdinr_rate(self):
        now = time.time()
        if (now - FX_CACHE["timestamp"]) < 300:
            return FX_CACHE["rate"]
        try:
            url = "https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X?interval=1d&range=5d"
            headers = {'User-Agent': 'Mozilla/5.0'}
            res = requests.get(url, headers=headers, timeout=5, verify=False)
            if res.status_code == 200:
                price = res.json()['chart']['result'][0]['meta']['regularMarketPrice']
                FX_CACHE["rate"] = round(float(price), 2)
                FX_CACHE["timestamp"] = now
        except Exception as e:
            print(f"[Warn] Failed to fetch USDINR FX rate: {e}", file=sys.stderr)
        return FX_CACHE["rate"]

    def fetch_single_ticker_data(self, sym):
        candidate_symbols = [sym]
        if not (sym.endswith('.NS') or sym.endswith('.BO') or '.' in sym or '=' in sym):
            candidate_symbols.extend([f"{sym}.NS", f"{sym}.BO"])

        last_error = None
        for candidate in candidate_symbols:
            try:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{candidate}?interval=1d&range=1mo"
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
                res = requests.get(url, headers=headers, timeout=6, verify=False)
                if res.status_code != 200:
                    continue

                data = res.json()
                chart_res = data.get('chart', {}).get('result')
                if not chart_res:
                    continue

                result = chart_res[0]
                meta = result['meta']

                price = meta.get('regularMarketPrice') or meta.get('chartPreviousClose')
                if price is None:
                    continue

                prev_close = meta.get('chartPreviousClose') or meta.get('previousClose') or price
                high_52 = meta.get('fiftyTwoWeekHigh') or (price * 1.25)
                low_52 = meta.get('fiftyTwoWeekLow') or (price * 0.75)
                name = meta.get('shortName') or meta.get('longName') or meta.get('symbol') or sym
                currency = meta.get('currency', 'USD').upper()
                exchange_name = meta.get('exchangeName', '').upper()

                exchange = "US"
                if "NSI" in exchange_name or "NSE" in exchange_name or candidate.endswith('.NS'):
                    exchange = "NSE"
                    currency = "INR"
                elif "BSE" in exchange_name or "BOM" in exchange_name or candidate.endswith('.BO'):
                    exchange = "BSE"
                    currency = "INR"
                elif "NMS" in exchange_name or "NGM" in exchange_name:
                    exchange = "NASDAQ"
                elif "NYQ" in exchange_name or "NYSE" in exchange_name:
                    exchange = "NYSE"

                price = float(price)
                prev_close = float(prev_close)
                change = round(price - prev_close, 2)
                change_pct = round((change / prev_close * 100) if prev_close > 0 else 0.0, 2)

                closes = []
                indicators = result.get('indicators', {})
                quotes_list = indicators.get('quote', [{}])[0].get('close', [])
                for c in quotes_list:
                    if c is not None:
                        closes.append(round(float(c), 2))

                if closes:
                    closes[-1] = round(price, 2)

                quote_obj = {
                    "price": round(price, 2),
                    "change": change,
                    "changePct": change_pct,
                    "high52": round(float(high_52), 2),
                    "low52": round(float(low_52), 2),
                    "name": name,
                    "currency": currency,
                    "exchange": exchange,
                    "resolvedSymbol": candidate
                }

                return quote_obj, closes
            except Exception as e:
                last_error = e

        if last_error:
            raise last_error
        raise ValueError(f"No market data found for {sym}")

    def fetch_quotes(self, symbols):
        now = time.time()
        results = {}

        for sym in symbols:
            if sym in QUOTE_CACHE and (now - QUOTE_CACHE[sym]['timestamp']) < CACHE_TTL:
                results[sym] = QUOTE_CACHE[sym]['data']
            else:
                try:
                    quote_obj, closes = self.fetch_single_ticker_data(sym)
                    QUOTE_CACHE[sym] = {"data": quote_obj, "timestamp": now}
                    if closes:
                        HISTORY_CACHE[f"{sym}_1mo"] = {"data": closes, "timestamp": now}
                    results[sym] = quote_obj
                except Exception as e:
                    print(f"[Warn] Error fetching {sym}: {e}", file=sys.stderr)
                    is_indian = sym.endswith('.NS') or sym.endswith('.BO')
                    fallback = {
                        "price": 1000.0 if is_indian else 100.0,
                        "change": 0.0,
                        "changePct": 0.0,
                        "high52": 1200.0 if is_indian else 120.0,
                        "low52": 800.0 if is_indian else 80.0,
                        "name": sym,
                        "currency": "INR" if is_indian else "USD",
                        "exchange": "NSE" if sym.endswith('.NS') else ("BSE" if sym.endswith('.BO') else "US"),
                        "resolvedSymbol": sym
                    }
                    results[sym] = QUOTE_CACHE.get(sym, {}).get('data', fallback)

        return results

    def fetch_history(self, symbols, period="1mo"):
        now = time.time()
        results = {}

        for sym in symbols:
            cache_key = f"{sym}_{period}"
            if cache_key in HISTORY_CACHE and (now - HISTORY_CACHE[cache_key]['timestamp']) < HIST_CACHE_TTL:
                results[sym] = HISTORY_CACHE[cache_key]['data']
            else:
                try:
                    quote_obj, closes = self.fetch_single_ticker_data(sym)
                    results[sym] = closes
                    HISTORY_CACHE[cache_key] = {"data": closes, "timestamp": now}
                    QUOTE_CACHE[sym] = {"data": quote_obj, "timestamp": now}
                except Exception as e:
                    print(f"[Warn] History fetch failed for {sym}: {e}", file=sys.stderr)
                    results[sym] = []

        return results

def run():
    print("=" * 60)
    print(f"  SheetTrader Pro - Paper Trading Server")
    print(f"  Serving on: http://0.0.0.0:{PORT}")
    print(f"  Directory:  {DIRECTORY}")
    print(f"  Multi-Device Sync & Live Quotes Active")
    print("=" * 60)

    httpd = HTTPServer(('0.0.0.0', PORT), SheetTraderHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == '__main__':
    run()
