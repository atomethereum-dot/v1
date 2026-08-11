(() => {
  const root = document.getElementById("supplyCalc");
  if (!root) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FALLBACK_META = {
    bitcoin: { supply: 20070000, price: 64940 },
    ethereum: { supply: 120000000, price: 1897 },
    "bitcoin-cash": { supply: 19870000, price: 216.69 },
    solana: { supply: 581000000, price: 73.8 },
    litecoin: { supply: 77470954, price: 45.69 },
    ripple: { supply: 59000000000, price: 2.85 },
    sui: { supply: 5700000000, price: 3.4 },
    hyperliquid: { supply: 450000000, price: 28.5 },
  };

  function assetMeta() {
    return window.SECTORA_ASSET_META || FALLBACK_META;
  }
  function secSupply() {
    return window.SECTORA_SEC_SUPPLY || 25000000;
  }

  function fmtPrice(n) {
    if (!isFinite(n)) return "$0";
    if (n >= 1000) return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtUSD(n) {
    if (!isFinite(n)) return "$0";
    if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  function fmtTokens(n) {
    if (!isFinite(n)) return "0";
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 1000 ? 2 : 0 });
  }

  const pills = Array.prototype.slice.call(root.querySelectorAll(".supply-calc-pill"));
  const slider = document.getElementById("calcPctSlider");
  const pctValueEl = document.getElementById("calcPctValue");
  const investInput = document.getElementById("calcInvestInput");
  const mcapOut = document.getElementById("calcMcapOut");
  const priceOut = document.getElementById("calcPriceOut");
  const tokensOut = document.getElementById("calcTokensOut");

  let selectedAsset = "bitcoin";
  const current = { mcap: 0, price: 0, tokens: 0 };
  const raf = { mcap: null, price: null, tokens: null };

  function livePrice(id) {
    const registry = window.SECTORA_ASSETS;
    if (registry) {
      for (let i = 0; i < registry.length; i++) {
        if (registry[i].id === id) return registry[i].price;
      }
    }
    const meta = assetMeta()[id];
    return meta ? meta.price : 0;
  }

  function computeValues() {
    const meta = assetMeta()[selectedAsset];
    const supply = meta ? meta.supply : 0;
    const price = livePrice(selectedAsset);
    const pct = parseFloat(slider.value) / 100;
    const mcap = price * supply * pct;
    const sectPrice = mcap / secSupply();
    const invest = Math.max(0, parseFloat(investInput.value) || 0);
    const tokens = sectPrice > 0 ? invest / sectPrice : 0;
    return { mcap: mcap, price: sectPrice, tokens: tokens };
  }

  function animateTo(key, el, target, fmt, duration) {
    if (reduced) {
      el.textContent = fmt(target);
      current[key] = target;
      return;
    }
    if (raf[key]) cancelAnimationFrame(raf[key]);
    const from = current[key];
    const delta = target - from;
    if (Math.abs(delta) < 1e-9) {
      el.textContent = fmt(target);
      current[key] = target;
      return;
    }
    const start = performance.now();
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + delta * eased;
      el.textContent = fmt(val);
      current[key] = val;
      if (p < 1) {
        raf[key] = requestAnimationFrame(frame);
      } else {
        raf[key] = null;
        current[key] = target;
      }
    }
    raf[key] = requestAnimationFrame(frame);
  }

  function render(animate) {
    const vals = computeValues();
    const duration = animate ? 500 : 0;
    if (animate) {
      animateTo("mcap", mcapOut, vals.mcap, fmtUSD, duration);
      animateTo("price", priceOut, vals.price, fmtPrice, duration);
      animateTo("tokens", tokensOut, vals.tokens, fmtTokens, duration);
    } else {
      if (raf.mcap) cancelAnimationFrame(raf.mcap);
      if (raf.price) cancelAnimationFrame(raf.price);
      if (raf.tokens) cancelAnimationFrame(raf.tokens);
      mcapOut.textContent = fmtUSD(vals.mcap);
      priceOut.textContent = fmtPrice(vals.price);
      tokensOut.textContent = fmtTokens(vals.tokens);
      current.mcap = vals.mcap;
      current.price = vals.price;
      current.tokens = vals.tokens;
    }
  }

  pills.forEach((pill) => {
    pill.addEventListener("click", () => {
      if (pill.dataset.asset === selectedAsset) return;
      selectedAsset = pill.dataset.asset;
      pills.forEach((p) => {
        const active = p === pill;
        p.classList.toggle("is-active", active);
        p.setAttribute("aria-checked", active ? "true" : "false");
      });
      render(true);
    });
  });

  slider.addEventListener("input", () => {
    pctValueEl.textContent = parseFloat(slider.value).toFixed(1) + "%";
    render(false);
  });

  investInput.addEventListener("input", () => {
    render(false);
  });

  document.addEventListener("sectora:pricetick", () => render(true));

  if (!("IntersectionObserver" in window)) {
    render(false);
  } else {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            render(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0 }
    );
    observer.observe(root);
  }
})();
