import urllib.request
import json
import threading
import time
import server

def test():
    httpd = server.HTTPServer(('127.0.0.1', 8899), server.SheetTraderHandler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    time.sleep(0.5)

    print("Testing /api/health...")
    with urllib.request.urlopen("http://127.0.0.1:8899/api/health") as res:
        print("Health response:", res.read().decode("utf-8"))

    print("Testing /api/quotes?symbols=AAPL,NVDA...")
    with urllib.request.urlopen("http://127.0.0.1:8899/api/quotes?symbols=AAPL,NVDA") as res:
        data = json.loads(res.read().decode("utf-8"))
        print("Quotes fetched for:", list(data.keys()))
        for k, v in data.items():
            print(f"  {k}: Price=${v.get('price')}, Chg={v.get('changePct')}%, Name={v.get('name')}")

    print("Testing /api/history?symbols=AAPL&period=1mo...")
    with urllib.request.urlopen("http://127.0.0.1:8899/api/history?symbols=AAPL&period=1mo") as res:
        hist = json.loads(res.read().decode("utf-8"))
        print("AAPL History points count:", len(hist.get("AAPL", [])))
        print("AAPL sample points:", hist.get("AAPL", [])[:5])

    httpd.shutdown()
    print("All tests completed successfully!")

if __name__ == "__main__":
    test()
