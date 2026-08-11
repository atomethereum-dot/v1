(() => {
  const section = document.getElementById("supply-scenarios");
  if (!section) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const SEC_SUPPLY = 25000000;
  const POLL_MS = 10000;
  const COINGECKO_URL =
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,bitcoin-cash,solana,litecoin,ripple,sui,hyperliquid&vs_currencies=usd";
  const BINANCE_URL = "https://api.binance.com/api/v3/ticker/price";
  const BINANCE_SYMBOLS = {
    bitcoin: "BTCUSDT",
    ethereum: "ETHUSDT",
    "bitcoin-cash": "BCHUSDT",
    solana: "SOLUSDT",
    litecoin: "LTCUSDT",
    ripple: "XRPUSDT",
    sui: "SUIUSDT",
    hyperliquid: "HYPEUSDT",
  };

  const ASSET_META = {
    bitcoin: { supply: 20070000, price: 64940 },
    ethereum: { supply: 120000000, price: 1897 },
    "bitcoin-cash": { supply: 19870000, price: 216.69 },
    solana: { supply: 581000000, price: 73.8 },
    litecoin: { supply: 77470954, price: 45.69 },
    ripple: { supply: 59000000000, price: 2.85 },
    sui: { supply: 5700000000, price: 3.4 },
    hyperliquid: { supply: 450000000, price: 28.5 },
  };
  window.SECTORA_ASSET_META = ASSET_META;
  window.SECTORA_SEC_SUPPLY = SEC_SUPPLY;

  function fmtPrice(n) {
    if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtLivePrice(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtUSD(n) {
    if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function t(key, fallback) {
    return window.SECTORA_T ? window.SECTORA_T(key) : fallback;
  }

  // ---- entrance animation ----
  function runBars() {
    section.querySelectorAll(".supply-bar-fill").forEach((fill) => {
      const pct = fill.dataset.pct;
      if (reduced) {
        fill.style.width = pct + "%";
        return;
      }
      requestAnimationFrame(() => {
        fill.style.width = pct + "%";
      });
    });
  }
  function animateCount(el) {
    const target = parseFloat(el.dataset.target);
    if (reduced) {
      el.textContent = fmtPrice(target);
      return;
    }
    const duration = 1200;
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtPrice(target * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function runCounts() {
    section.querySelectorAll("[data-count]").forEach(animateCount);
  }

  function onEntrance() {
    runBars();
    runCounts();
    setTimeout(startLive, reduced ? 0 : 1400);
  }

  if (!("IntersectionObserver" in window)) {
    onEntrance();
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onEntrance();
            observer.unobserve(entry.target);
          }
        });
      },
      // threshold: 0 (not a fraction like 0.3) — this section is tall enough
      // (table + calculator) that a large percentage of it is often never
      // simultaneously visible on typical viewports, especially mobile,
      // which meant entrance/live-start could silently never fire.
      { threshold: 0 }
    );
    observer.observe(section);
  }

  // ---- live data via the public CoinGecko API (plain fetch, works for any visitor) ----

  const statusDot = document.getElementById("supplyStatusDot");
  const statusText = document.getElementById("supplyStatusText");
  const stamp = document.getElementById("supplyStamp");

  let currentStatus = { mode: "connecting", reasonKey: null };
  let lastTickTs = null;

  function renderStatusText() {
    if (!statusText) return;
    // innerHTML (not textContent) so HTML entities in the dictionary
    // (&hellip;, etc.) render as glyphs — these are our own static
    // translated strings, never user input.
    const mode = currentStatus.mode;
    if (mode === "connecting") {
      statusText.innerHTML = t("supplyScenarios.statusConnecting", "Connecting to live prices&hellip;");
    } else if (mode === "live") {
      statusText.innerHTML = t("supplyScenarios.statusLive", "LIVE · updates ~10s");
    } else {
      const base = t("supplyScenarios.statusStatic", "STATIC SNAPSHOT");
      const reason = currentStatus.reasonKey ? t(currentStatus.reasonKey, "") : "";
      statusText.innerHTML = reason ? base + " — " + reason : base;
    }
  }

  function setStatus(mode, reasonKey) {
    currentStatus = { mode: mode, reasonKey: reasonKey || null };
    if (statusDot) statusDot.className = "supply-status-dot supply-status-dot--" + mode;
    renderStatusText();
  }

  function renderStamp() {
    if (!stamp) return;
    if (lastTickTs) {
      stamp.innerHTML = t(
        "supplyScenarios.stampLive",
        "SOURCE: LIVE MARKET DATA · #SECT SCENARIOS COMPUTED CLIENT-SIDE · LAST TICK {time}"
      ).replace("{time}", fmtClock(lastTickTs));
    }
    // While no live tick has landed yet, the stamp keeps whatever the page's
    // own data-i18n walk rendered for supplyScenarios.stampStatic.
  }

  function markLiveUpdated(ts) {
    lastTickTs = ts;
    renderStamp();
  }

  document.addEventListener("sectora:langchange", () => {
    renderStatusText();
    renderStamp();
  });

  const assets = [];
  section.querySelectorAll("[data-asset]").forEach((row) => {
    const id = row.dataset.asset;
    const meta = ASSET_META[id];
    if (!meta) return;
    let asset = assets.filter((a) => a.id === id)[0];
    if (!asset) {
      asset = { id: id, supply: meta.supply, price: meta.price, liveMode: false, targets: [] };
      assets.push(asset);
    }
    asset.targets.push({
      rowEl: row,
      isMobile: row.classList.contains("supply-mobile-row"),
      dot: row.querySelector('[data-el="dot"]'),
      price: row.querySelector('[data-el="price"]'),
      mcap: row.querySelector('[data-el="mcap"]'),
      bar: row.querySelector('[data-el="bar"]'),
      implied5: row.querySelector('[data-el="implied5"]'),
    });
  });
  window.SECTORA_ASSETS = assets;

  function flash(el, dir) {
    if (!el) return;
    el.classList.remove("flash-up", "flash-down");
    void el.offsetWidth;
    el.classList.add(dir > 0 ? "flash-up" : "flash-down");
    setTimeout(() => el.classList.remove("flash-up", "flash-down"), 1400);
  }

  function recomputeBars() {
    const mcaps = assets.map((a) => a.price * a.supply);
    const maxLog = Math.log10(Math.max.apply(null, mcaps));
    const minLog = Math.log10(Math.min.apply(null, mcaps));
    const span = maxLog - minLog || 1;
    assets.forEach((a, i) => {
      const pct = 8 + ((Math.log10(mcaps[i]) - minLog) / span) * 92;
      a.targets.forEach((t) => {
        if (t.bar) t.bar.style.width = pct + "%";
      });
    });
  }

  function renderAsset(asset, price, live) {
    const fmt = live ? fmtLivePrice : fmtPrice;
    const mcap = price * asset.supply;
    const implied5 = (mcap * 0.05) / SEC_SUPPLY;
    asset.targets.forEach((t) => {
      if (t.price) t.price.textContent = fmt(price);
      if (t.mcap) t.mcap.textContent = fmtUSD(mcap);
      if (t.implied5) t.implied5.textContent = fmtPrice(implied5);
    });
    asset.price = price;
  }

  function tweenAsset(asset, target, duration, live) {
    if (asset.tweenRaf) cancelAnimationFrame(asset.tweenRaf);
    const from = asset.price;
    const delta = target - from;
    if (delta === 0) return;
    const dir = delta > 0 ? 1 : -1;
    const start = performance.now();
    if (live) {
      asset.targets.forEach((t) => {
        flash(t.isMobile ? t.rowEl : t.price, dir);
      });
    }
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 2);
      renderAsset(asset, from + delta * eased, live);
      if (t < 1) {
        asset.tweenRaf = requestAnimationFrame(frame);
      } else {
        asset.tweenRaf = null;
        recomputeBars();
      }
    }
    asset.tweenRaf = requestAnimationFrame(frame);
  }

  let anyTickEver = false;
  let stallTimer = null;
  let pollTimer = null;
  let consecutiveFailures = 0;

  function goStatic(reasonKey) {
    setStatus("static", reasonKey);
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function fetchCoinGeckoPrices() {
    return fetch(COINGECKO_URL, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error("coingecko_http_" + res.status);
      return res.json();
    }).then((data) => {
      const prices = {};
      assets.forEach((asset) => {
        const entry = data[asset.id];
        const price = entry && typeof entry.usd === "number" ? entry.usd : null;
        if (price) prices[asset.id] = price;
      });
      return prices;
    });
  }

  function fetchBinancePrices() {
    return fetch(BINANCE_URL, { cache: "no-store" }).then((res) => {
      if (!res.ok) throw new Error("binance_http_" + res.status);
      return res.json();
    }).then((list) => {
      const bySymbol = {};
      (Array.isArray(list) ? list : []).forEach((row) => {
        bySymbol[row.symbol] = parseFloat(row.price);
      });
      const prices = {};
      assets.forEach((asset) => {
        const symbol = BINANCE_SYMBOLS[asset.id];
        const price = symbol && bySymbol[symbol];
        if (price && !isNaN(price)) prices[asset.id] = price;
      });
      return prices;
    });
  }

  function applyPrices(prices) {
    let anySuccess = false;
    assets.forEach((asset) => {
      const price = prices[asset.id];
      if (price) {
        anySuccess = true;
        asset.liveMode = true;
        tweenAsset(asset, price, 700, true);
        asset.targets.forEach((t) => {
          if (t.dot) t.dot.classList.add("live");
        });
      }
    });
    if (!anySuccess) return false;
    consecutiveFailures = 0;
    if (!anyTickEver) {
      anyTickEver = true;
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    }
    setStatus("live", null);
    recomputeBars();
    markLiveUpdated(Date.now());
    document.dispatchEvent(new CustomEvent("sectora:pricetick"));
    return true;
  }

  function pollPrices() {
    fetchCoinGeckoPrices()
      .then((prices) => {
        if (!applyPrices(prices)) throw new Error("coingecko_no_prices");
      })
      .catch((primaryErr) => {
        console.warn("[supply-scenarios] CoinGecko poll failed, trying Binance:", primaryErr);
        fetchBinancePrices()
          .then((prices) => {
            if (!applyPrices(prices)) throw new Error("binance_no_prices");
          })
          .catch((fallbackErr) => {
            consecutiveFailures += 1;
            console.warn("[supply-scenarios] Binance fallback also failed:", fallbackErr);
            if (consecutiveFailures >= 4) {
              goStatic("supplyScenarios.statusStaticFail");
            }
          });
      });
  }

  function startLive() {
    if (!("fetch" in window)) {
      setStatus("static", null);
      return;
    }
    setStatus("connecting", null);
    stallTimer = setTimeout(() => {
      if (!anyTickEver) goStatic("supplyScenarios.statusStaticStall");
    }, 12000);
    pollPrices();
    pollTimer = setInterval(pollPrices, POLL_MS);
  }
})();
