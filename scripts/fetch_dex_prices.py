#!/usr/bin/env python3
"""Fetches real crypto/metal/index prices server-side (no browser CORS
involved) and writes dex-prices.json at the repo root. Run on a schedule by
.github/workflows/update-dex-prices.yml. A partial failure keeps whatever
was already on disk for the ids that couldn't be fetched this run, so one
bad run never wipes out good data."""
import json
import sys
import time
import urllib.request

COIN_IDS = [
    "bitcoin", "ethereum", "bitcoin-cash", "solana", "litecoin",
    "ripple", "sui", "hyperliquid", "pax-gold", "kinesis-silver",
]
INDEX_SYMBOLS = ["^DJI", "^GSPC", "^IXIC"]
OUT_PATH = "dex-prices.json"


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SectoraDexBot)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_coins():
    url = (
        "https://api.coingecko.com/api/v3/simple/price?ids="
        + ",".join(COIN_IDS)
        + "&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true"
    )
    return fetch_json(url)


def fetch_indices():
    out = {}
    for sym in INDEX_SYMBOLS:
        try:
            url = "https://query1.finance.yahoo.com/v8/finance/chart/" + sym + "?range=1d&interval=5m"
            data = fetch_json(url)
            meta = data["chart"]["result"][0]["meta"]
            out[sym] = {
                "regularMarketPrice": meta.get("regularMarketPrice"),
                "chartPreviousClose": meta.get("chartPreviousClose") or meta.get("previousClose"),
                "regularMarketDayHigh": meta.get("regularMarketDayHigh"),
                "regularMarketDayLow": meta.get("regularMarketDayLow"),
                "regularMarketVolume": meta.get("regularMarketVolume"),
            }
        except Exception as e:
            print("yahoo failed for " + sym + ": " + str(e), file=sys.stderr)
    return out


def main():
    coins = {}
    indices = {}
    try:
        coins = fetch_coins()
    except Exception as e:
        print("coingecko failed: " + str(e), file=sys.stderr)

    try:
        indices = fetch_indices()
    except Exception as e:
        print("indices fetch failed: " + str(e), file=sys.stderr)

    existing = {"coins": {}, "indices": {}}
    try:
        with open(OUT_PATH) as f:
            existing = json.load(f)
    except Exception:
        pass

    merged_coins = dict(existing.get("coins", {}))
    merged_coins.update(coins)
    merged_indices = dict(existing.get("indices", {}))
    merged_indices.update(indices)

    if not merged_coins and not merged_indices:
        print("nothing fetched and nothing on disk, skipping write", file=sys.stderr)
        return 1

    out = {"updatedAt": int(time.time() * 1000), "coins": merged_coins, "indices": merged_indices}
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print("wrote " + OUT_PATH + " (" + str(len(merged_coins)) + " coins, " + str(len(merged_indices)) + " indices)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
