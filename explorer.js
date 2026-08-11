(function () {
  "use strict";

  /* ============================================================
     PRNG + basic random helpers (seeded, deterministic per load)
     ============================================================ */
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260809 ^ Date.now() & 0xffff);
  const HEX = "0123456789abcdef";
  function randHex(len) {
    let s = "";
    for (let i = 0; i < len; i++) s += HEX[(rand() * 16) | 0];
    return s;
  }
  function randAddress() { return "0x" + randHex(40); }
  function randTxHash() { return "0x" + randHex(64); }
  function pick(arr) { return arr[(rand() * arr.length) | 0]; }
  function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
  function randFloat(min, max) { return rand() * (max - min) + min; }
  function skewSmall(min, max) { return min + Math.pow(rand(), 2.4) * (max - min); }
  function weightedPick(pairs) {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let r = rand() * total;
    for (const [val, w] of pairs) { r -= w; if (r <= 0) return val; }
    return pairs[0][0];
  }

  /* ============================================================
     Chain identity + known addresses / tokens
     ============================================================ */
  const CHAIN = {
    name: "Sectora L3 Testnet",
    symbol: "SECT",
    layer: "Layer 3",
    settlesTo: "Ethereum",
    blockTimeMs: 2100,
    gasLimit: 30000000,
  };

  const KNOWN = new Map(); // address -> label
  function makeKnown(label) {
    const a = randAddress();
    KNOWN.set(a.toLowerCase(), label);
    return a;
  }

  const ADDR = {
    buyback: makeKnown("Sectora: Buyback Pool"),
    validatorRewards: makeKnown("Sectora: Validator Rewards"),
    bridge: makeKnown("Sectora: L2 Bridge"),
    hashMarket: makeKnown("Sectora: HashMarket"),
    dexRouter: makeKnown("Sectora: DEX Router"),
    usdxPool: makeKnown("Sectora: USDX Liquidity Pool"),
    treasury: makeKnown("Sectora: Foundation Treasury"),
    stakingPool: makeKnown("Sectora: Staking Pool"),
  };

  const VALIDATORS = [];
  for (let i = 1; i <= 9; i++) {
    VALIDATORS.push(makeKnown("Validator: sect-node-" + String(i).padStart(2, "0")));
  }

  const TOKENS = [
    { symbol: "SECT", name: "Sectora", kind: "Native", color: "#468ce6", price: 0.1034, supply: 50000000, holders: 8412, addr: makeKnown("Sectora Token") },
    { symbol: "xAU", name: "Tokenized Gold", kind: "RWA · Metal", color: "#d4af37", price: 2412.5, supply: 1240, holders: 318, addr: makeKnown("Sectora: xAU Vault") },
    { symbol: "xAG", name: "Tokenized Silver", kind: "RWA · Metal", color: "#b7bcc4", price: 28.65, supply: 18500, holders: 542, addr: makeKnown("Sectora: xAG Vault") },
    { symbol: "xSPX", name: "Tokenized S&P 500 Index", kind: "RWA · Index", color: "#14e0a0", price: 5487.2, supply: 640, holders: 214, addr: makeKnown("Sectora: xSPX Index Token") },
    { symbol: "xDJI", name: "Tokenized Dow Jones Index", kind: "RWA · Index", color: "#6c5ce7", price: 40120.75, supply: 210, holders: 96, addr: makeKnown("Sectora: xDJI Index Token") },
    { symbol: "xIXIC", name: "Tokenized Nasdaq Composite", kind: "RWA · Index", color: "#ff8a3d", price: 17890.4, supply: 480, holders: 141, addr: makeKnown("Sectora: xIXIC Index Token") },
    { symbol: "USDX", name: "Sectora USD", kind: "Stablecoin", color: "#3fae72", price: 1.0, supply: 12000000, holders: 1854, addr: makeKnown("Sectora: USDX Stablecoin") },
  ];
  const TOKEN_BY_SYMBOL = new Map(TOKENS.map((t) => [t.symbol.toLowerCase(), t]));
  const TOKEN_BY_ADDR = new Map(TOKENS.map((t) => [t.addr.toLowerCase(), t]));

  const METHODS_NATIVE = [
    ["Transfer", 34], ["Swap", 15], ["Approve", 10], ["Mint", 7],
    ["Bridge Deposit", 7], ["Bridge Withdraw", 5], ["Stake", 6],
    ["Unstake", 3], ["Claim Rewards", 5], ["Buyback Execute", 3], ["Register Asset", 5],
  ];

  /* ============================================================
     Block / transaction generation
     ============================================================ */
  const TIP_START = 5431904;
  const BACKLOG = 260;
  const NOW0 = Date.now();

  const BLOCKS = []; // newest first
  const TXS = []; // newest first
  const BLOCK_BY_NUM = new Map();
  const TX_BY_HASH = new Map();
  const ADDR_TXS = new Map(); // addr(lower) -> [tx,...] newest first
  const TOKEN_TXS = new Map(); // symbol -> [tx,...]
  let currentTip = TIP_START;

  function trackAddrTx(addr, tx) {
    if (!addr) return;
    const k = addr.toLowerCase();
    let list = ADDR_TXS.get(k);
    if (!list) { list = []; ADDR_TXS.set(k, list); }
    list.unshift(tx);
  }

  function randomActor() {
    const r = rand();
    if (r < 0.12) return pick(Object.values(ADDR));
    if (r < 0.16) return pick(VALIDATORS);
    if (r < 0.22) return pick(TOKENS).addr;
    return randAddress();
  }

  function makeTx(blockNumber, ts) {
    const hash = randTxHash();
    const from = randomActor();
    let to = randomActor();
    let guard = 0;
    while (to === from && guard++ < 5) to = randomActor();

    const isTokenTx = rand() < 0.32;
    const gasUsed = randInt(21000, 210000);
    const gasPrice = randFloat(0.6, 3.4); // "Gwei"-style unit on the L3
    const fee = (gasUsed * gasPrice) / 1e9;
    const status = rand() < 0.017 ? "fail" : "success";
    let method, value, token, tokenAmount;

    if (isTokenTx) {
      token = pick(TOKENS).symbol;
      method = weightedPick([["Transfer", 60], ["Approve", 18], ["Mint", 12], ["Burn", 10]]);
      value = 0;
      tokenAmount = token === "SECT" ? skewSmall(1, 25000) : token === "USDX" ? skewSmall(1, 40000) : skewSmall(0.001, token === "xAU" || token === "xAG" ? 12 : 3);
    } else {
      method = weightedPick(METHODS_NATIVE);
      value = method === "Approve" ? 0 : skewSmall(0.0005, 6200);
    }

    const tx = {
      hash, blockNumber, timestamp: ts, from, to, method, status,
      value, token, tokenAmount, fee, gasUsed, gasPrice,
      gasLimit: Math.round(gasUsed * randFloat(1.08, 1.45)),
      nonce: randInt(0, 4200),
      input: method === "Transfer" && !isTokenTx ? "0x" : "0x" + randHex(randInt(8, 136)),
    };
    TX_BY_HASH.set(hash, tx);
    TXS.unshift(tx);
    trackAddrTx(from, tx);
    if (to !== from) trackAddrTx(to, tx);
    if (token) {
      let list = TOKEN_TXS.get(token);
      if (!list) { list = []; TOKEN_TXS.set(token, list); }
      list.unshift(tx);
    }
    return tx;
  }

  function makeBlock(number, ts) {
    const validator = pick(VALIDATORS);
    const gasLimit = CHAIN.gasLimit;
    const txCount = randInt(1, 9);
    const hash = randTxHash();
    const parentHash = BLOCK_BY_NUM.has(number - 1) ? BLOCK_BY_NUM.get(number - 1).hash : "0x" + randHex(64);
    const block = {
      number, timestamp: ts, hash, parentHash, validator,
      txCount, gasLimit, gasUsed: 0, baseFee: randFloat(0.02, 0.38),
      reward: randFloat(0.35, 1.1), txs: [],
    };
    for (let i = 0; i < txCount; i++) {
      const tx = makeTx(number, ts);
      block.txs.push(tx.hash);
      block.gasUsed += tx.gasUsed;
    }
    block.gasUsed = Math.min(block.gasUsed, Math.round(gasLimit * 0.97));
    BLOCK_BY_NUM.set(number, block);
    BLOCKS.unshift(block);
    return block;
  }

  (function seedBacklog() {
    let ts = NOW0 - BACKLOG * CHAIN.blockTimeMs;
    const startNum = TIP_START - BACKLOG + 1;
    for (let i = 0; i < BACKLOG; i++) {
      ts += CHAIN.blockTimeMs * (0.7 + rand() * 0.55);
      makeBlock(startNum + i, Math.min(ts, NOW0));
    }
    currentTip = TIP_START;
  })();

  const MAX_KEEP_BLOCKS = 4000;
  const MAX_KEEP_TXS = 20000;
  function pushLiveBlock() {
    currentTip += 1;
    makeBlock(currentTip, Date.now());
    if (BLOCKS.length > MAX_KEEP_BLOCKS) BLOCKS.length = MAX_KEEP_BLOCKS;
    if (TXS.length > MAX_KEEP_TXS) TXS.length = MAX_KEEP_TXS;
  }

  /* ============================================================
     Formatting helpers
     ============================================================ */
  function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }
  function fmtNum(n, dec) {
    if (n === undefined || n === null || isNaN(n)) return "0";
    return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function fmtAmount(n, maxDec = 6) {
    if (n === 0) return "0";
    if (Math.abs(n) < 0.000001) return n.toExponential(2);
    let s = n.toLocaleString("en-US", { maximumFractionDigits: maxDec, minimumFractionDigits: 0 });
    return s;
  }
  function fmtUsd(n) {
    if (n >= 1e9) return "$" + fmtNum(n / 1e9, 2) + "B";
    if (n >= 1e6) return "$" + fmtNum(n / 1e6, 2) + "M";
    if (n >= 1e3) return "$" + fmtNum(n / 1e3, 2) + "K";
    return "$" + fmtNum(n, n < 10 ? 4 : 2);
  }
  function shortHash(h, front = 8, back = 6) {
    if (!h) return "";
    return h.slice(0, front) + "…" + h.slice(-back);
  }
  function shortAddr(a) { return shortHash(a, 6, 4); }
  function timeAgo(ts) {
    let s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return "a few secs ago";
    if (s < 60) return s + " secs ago";
    let m = Math.floor(s / 60);
    if (m < 60) return m + (m === 1 ? " min ago" : " mins ago");
    let h = Math.floor(m / 60);
    if (h < 24) return h + (h === 1 ? " hr ago" : " hrs ago");
    let d = Math.floor(h / 24);
    return d + (d === 1 ? " day ago" : " days ago");
  }
  function fmtDateTime(ts) {
    const d = new Date(ts);
    return d.toUTCString().replace("GMT", "UTC");
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function labelFor(addr) {
    if (!addr) return "";
    return KNOWN.get(addr.toLowerCase()) || "";
  }
  function isKnownContract(addr) { return KNOWN.has((addr || "").toLowerCase()) || TOKEN_BY_ADDR.has((addr || "").toLowerCase()); }

  /* ============================================================
     Icons (self-hosted inline SVG)
     ============================================================ */
  const ICO = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-9 5-9-5V8l9-5 9 5Z"/><path d="M3.3 7.5 12 12.5l8.7-5"/><path d="M12 22V12.5"/></svg>',
    fuel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18"/><path d="m14 8 3.5 3.5a1.5 1.5 0 0 0 2.5-1V6.5"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
    coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>',
    check2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    cross2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  };
  function copyBtn(text) {
    return '<button type="button" class="ex-copy" data-copy="' + esc(text) + '" title="Copy to clipboard" aria-label="Copy">' + ICO.copy + "</button>";
  }
  function tokenIcon(t, size) {
    size = size || 22;
    const initials = t.symbol.replace(/^x/, "").slice(0, 2).toUpperCase();
    return '<span class="ex-tk-icon" style="width:' + size + "px;height:" + size + "px;background:" + t.color + '22;color:' + t.color + ';border-color:' + t.color + '44">' + esc(initials) + "</span>";
  }
  function statusPill(status) {
    return status === "success"
      ? '<span class="ex-pill ex-pill--ok">' + ICO.check2 + "<span>Success</span></span>"
      : '<span class="ex-pill ex-pill--fail">' + ICO.cross2 + "<span>Fail</span></span>";
  }
  function methodPill(method) {
    const cls = { Transfer: "gray", Swap: "blue", Approve: "amber", Mint: "green", Burn: "red",
      "Bridge Deposit": "blue", "Bridge Withdraw": "blue", Stake: "green", Unstake: "amber",
      "Claim Rewards": "green", "Buyback Execute": "purple", "Register Asset": "purple" }[method] || "gray";
    return '<span class="ex-method ex-method--' + cls + '">' + esc(method) + "</span>";
  }
  function addrLink(addr, opts) {
    opts = opts || {};
    const lbl = labelFor(addr);
    const tok = TOKEN_BY_ADDR.get((addr || "").toLowerCase());
    const inner = tok
      ? tokenIcon(tok, 16) + '<span class="ex-addr-label">' + esc(tok.name) + " (" + esc(tok.symbol) + ")</span>"
      : lbl
      ? '<span class="ex-addr-label">' + esc(lbl) + "</span>"
      : "";
    const codeCls = opts.mono !== false ? "ex-mono" : "";
    return (
      '<a class="ex-addr-link" href="#/address/' + addr + '">' +
      (inner ? inner + '<span class="ex-addr-sub ' + codeCls + '">' + shortAddr(addr) + "</span>" : '<span class="' + codeCls + '">' + shortAddr(addr) + "</span>") +
      "</a>" + copyBtn(addr)
    );
  }

  /* ============================================================
     Router helpers
     ============================================================ */
  function parseRoute() {
    let h = location.hash.replace(/^#\/?/, "");
    const qIdx = h.indexOf("?");
    let pathPart = h, queryPart = "";
    if (qIdx >= 0) { pathPart = h.slice(0, qIdx); queryPart = h.slice(qIdx + 1); }
    const parts = pathPart.split("/").filter(Boolean);
    const params = new URLSearchParams(queryPart);
    return { parts, params };
  }
  function paginate(total, page, perPage) {
    const pages = Math.max(1, Math.ceil(total / perPage));
    page = Math.min(Math.max(1, page || 1), pages);
    return { page, pages, start: (page - 1) * perPage, end: Math.min(total, page * perPage) };
  }
  function pagerHTML(baseHash, page, pages) {
    const link = (p) => baseHash + (baseHash.includes("?") ? "&" : "?") + "page=" + p;
    const dis = (cond) => (cond ? ' aria-disabled="true" tabindex="-1"' : "");
    return (
      '<div class="ex-pager">' +
      '<a class="ex-pager-btn" href="' + link(1) + '"' + dis(page <= 1) + ">First</a>" +
      '<a class="ex-pager-btn" href="' + link(Math.max(1, page - 1)) + '"' + dis(page <= 1) + ">‹ Prev</a>" +
      '<span class="ex-pager-info">Page ' + page + " of " + pages + "</span>" +
      '<a class="ex-pager-btn" href="' + link(Math.min(pages, page + 1)) + '"' + dis(page >= pages) + ">Next ›</a>" +
      '<a class="ex-pager-btn" href="' + link(pages) + '"' + dis(page >= pages) + ">Last</a>" +
      "</div>"
    );
  }

  /* ============================================================
     Small inline chart (SVG bars / line, no library)
     ============================================================ */
  function barChart(values, opts) {
    opts = opts || {};
    const w = opts.w || 560, h = opts.h || 120, gap = 3;
    const n = values.length;
    const bw = (w - gap * (n - 1)) / n;
    const max = Math.max(...values, 1);
    const color = opts.color || "var(--ex-blue)";
    let bars = "";
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2, (values[i] / max) * (h - 18));
      const x = i * (bw + gap);
      const y = h - bh - 14;
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + color + '" opacity="0.88"><title>' + fmtInt(values[i]) + "</title></rect>";
    }
    return '<svg class="ex-chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' + bars + "</svg>";
  }
  function lineChart(values, opts) {
    opts = opts || {};
    const w = opts.w || 560, h = opts.h || 120, pad = 6;
    const n = values.length;
    const max = Math.max(...values), min = Math.min(...values);
    const span = max - min || 1;
    const step = (w - pad * 2) / (n - 1);
    let pts = [];
    for (let i = 0; i < n; i++) {
      const x = pad + i * step;
      const y = pad + (1 - (values[i] - min) / span) * (h - pad * 2);
      pts.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    const color = opts.color || "var(--ex-blue)";
    const path = "M" + pts.join(" L");
    const area = path + " L" + pts[pts.length - 1].split(",")[0] + "," + (h - pad) + " L" + pts[0].split(",")[0] + "," + (h - pad) + " Z";
    return (
      '<svg class="ex-chart" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none">' +
      '<path d="' + area + '" fill="' + color + '" opacity="0.12"></path>' +
      '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>' +
      "</svg>"
    );
  }
  function days14Values(base, spread) {
    const out = [];
    let v = base;
    for (let i = 0; i < 14; i++) {
      v = Math.max(base * 0.4, v + (rand() - 0.48) * spread);
      out.push(v);
    }
    return out;
  }
  const DAILY_TX = days14Values(2400, 500);
  const DAILY_ADDR = days14Values(180, 40);
  const PRICE_HIST = (() => { const out = []; let v = 0.095; for (let i = 0; i < 30; i++) { v = Math.max(0.05, v + (rand() - 0.47) * 0.006); out.push(v); } return out; })();
  const TVL_HIST = days14Values(24500000, 900000);

  /* ============================================================
     Render helpers: rows
     ============================================================ */
  function blockRow(b) {
    return (
      '<tr><td><a class="ex-link ex-mono" href="#/block/' + b.number + '">' + fmtInt(b.number) + "</a></td>" +
      '<td class="ex-age" data-ts="' + b.timestamp + '">' + timeAgo(b.timestamp) + "</td>" +
      '<td><a class="ex-link" href="#/block/' + b.number + '">' + b.txCount + " txns</a></td>" +
      "<td>" + addrLink(b.validator) + "</td>" +
      '<td class="ex-num">' + fmtInt(b.gasUsed) + "</td>" +
      '<td class="ex-num ex-hide-sm">' + fmtInt(b.gasLimit) + "</td>" +
      '<td class="ex-num ex-hide-sm">' + fmtAmount(b.reward, 4) + " SECT</td></tr>"
    );
  }
  function txRow(t) {
    const amount = t.token
      ? fmtAmount(t.tokenAmount, 4) + " " + t.token
      : fmtAmount(t.value, 4) + " SECT";
    return (
      '<tr><td><a class="ex-link ex-mono" href="#/tx/' + t.hash + '">' + shortHash(t.hash) + "</a>" + copyBtn(t.hash) + "</td>" +
      "<td>" + methodPill(t.method) + "</td>" +
      '<td><a class="ex-link ex-mono" href="#/block/' + t.blockNumber + '">' + fmtInt(t.blockNumber) + "</a></td>" +
      '<td class="ex-age" data-ts="' + t.timestamp + '">' + timeAgo(t.timestamp) + "</td>" +
      "<td>" + addrLink(t.from) + "</td>" +
      '<td class="ex-dir">' + ICO.arrowRight + "</td>" +
      "<td>" + addrLink(t.to) + "</td>" +
      '<td class="ex-num">' + amount + "</td>" +
      '<td class="ex-num ex-hide-sm">' + fmtAmount(t.fee, 6) + "</td></tr>"
    );
  }

  /* ============================================================
     Views
     ============================================================ */
  function statCards() {
    const sect = TOKEN_BY_SYMBOL.get("sect");
    const change = ((sect.price / 0.1034 - 1) * 100).toFixed(2);
    return (
      '<div class="ex-stats">' +
      statCard("SECT PRICE", "$" + fmtAmount(sect.price, 4), (change >= 0 ? "+" : "") + change + "% (24h)", change >= 0 ? "up" : "down") +
      statCard("TRANSACTIONS", fmtInt(TXS.length) + " txns", fmtInt(Math.round(DAILY_TX[DAILY_TX.length - 1])) + " today", "flat") +
      statCard("MED GAS PRICE", fmtAmount(1.6, 2) + " Gwei", "~$0.00002 / txn", "flat") +
      statCard("WALLETS", fmtInt(ADDR_TXS.size) + " addresses", "tracked this session", "flat") +
      "</div>"
    );
  }
  function statCard(label, value, sub, dir) {
    return (
      '<div class="ex-stat-card"><div class="ex-stat-label">' + label + "</div>" +
      '<div class="ex-stat-value">' + value + "</div>" +
      '<div class="ex-stat-sub ex-stat-sub--' + dir + '">' + sub + "</div></div>"
    );
  }

  function rwaSection() {
    const rwaTokens = TOKENS.filter((t) => t.kind.startsWith("RWA"));
    let cards = rwaTokens
      .map((t) => {
        const chg = (((t.price / (t.baseline || t.price)) - 1) * 100);
        return (
          '<a class="ex-rwa-card" href="#/token/' + t.addr + '">' +
          tokenIcon(t, 30) +
          '<span class="ex-rwa-name">' + esc(t.symbol) + '<small>' + esc(t.name) + "</small></span>" +
          '<span class="ex-rwa-price">$' + fmtAmount(t.price, 2) + "</span>" +
          '<span class="ex-rwa-cap">Mkt Cap ' + fmtUsd(t.price * t.supply) + "</span></a>"
        );
      })
      .join("");
    return (
      '<section class="ex-rwa">' +
      '<div class="ex-rwa-head">' +
      '<h2>Tokenized Real-World Assets</h2>' +
      '<p>Sectora is a ' + CHAIN.layer + ' network purpose-built to mint, settle and track on-chain representations of off-chain assets &mdash; metals, indices and more &mdash; anchored to ' + CHAIN.settlesTo + '.</p>' +
      "</div>" +
      '<div class="ex-rwa-grid">' + cards + "</div>" +
      '<a class="ex-rwa-more" href="#/tokens">View all tokens ' + ICO.arrowRight + "</a>" +
      "</section>"
    );
  }

  function renderHome() {
    const latestBlocks = BLOCKS.slice(0, 7);
    const latestTxs = TXS.slice(0, 7);
    return (
      '<section class="ex-hero">' +
      '<h1>The Sectora ' + CHAIN.layer + ' Explorer</h1>' +
      '<p>Search the Sectora Testnet for blocks, transactions, addresses and tokenized real-world assets.</p>' +
      '<form class="ex-hero-search" id="exHeroSearch">' +
      '<span class="ex-hero-search-icon">' + ICO.search + "</span>" +
      '<input type="text" id="exHeroSearchInput" placeholder="Search by Address / Txn Hash / Block / Token" autocomplete="off" spellcheck="false" />' +
      '<button type="submit">Search</button>' +
      "</form>" +
      '<div class="ex-hero-error" id="exHeroError" hidden></div>' +
      "</section>" +
      statCards() +
      rwaSection() +
      '<section class="ex-cols">' +
      '<div class="ex-panel">' +
      '<div class="ex-panel-head"><h3>' + ICO.cube + " Latest Blocks</h3></div>" +
      '<div class="ex-list" id="exLatestBlocks">' +
      latestBlocks.map(latestBlockCard).join("") +
      "</div>" +
      '<a class="ex-panel-more" href="#/blocks">View all blocks ' + ICO.arrowRight + "</a>" +
      "</div>" +
      '<div class="ex-panel">' +
      '<div class="ex-panel-head"><h3>' + ICO.coins + " Latest Transactions</h3></div>" +
      '<div class="ex-list" id="exLatestTxs">' +
      latestTxs.map(latestTxCard).join("") +
      "</div>" +
      '<a class="ex-panel-more" href="#/txs">View all transactions ' + ICO.arrowRight + "</a>" +
      "</div>" +
      "</section>" +
      '<section class="ex-charts-preview">' +
      chartCard("Daily Transactions", "14 Days", barChart(DAILY_TX, { color: "var(--ex-blue)" })) +
      chartCard("SECT Price", "30 Days", lineChart(PRICE_HIST, { color: "var(--ex-green)" })) +
      "</section>"
    );
  }
  function latestBlockCard(b) {
    return (
      '<div class="ex-row-card">' +
      '<div class="ex-row-card-icon">' + ICO.cube + "</div>" +
      '<div class="ex-row-card-main">' +
      '<a class="ex-link ex-mono" href="#/block/' + b.number + '">' + fmtInt(b.number) + "</a>" +
      '<span class="ex-age" data-ts="' + b.timestamp + '">' + timeAgo(b.timestamp) + "</span>" +
      "</div>" +
      '<div class="ex-row-card-sub">Validator ' + addrLink(b.validator) + "</div>" +
      '<div class="ex-row-card-end"><span>' + b.txCount + " txns</span><small>" + fmtAmount(b.reward, 3) + " SECT</small></div>" +
      "</div>"
    );
  }
  function latestTxCard(t) {
    const amount = t.token ? fmtAmount(t.tokenAmount, 3) + " " + t.token : fmtAmount(t.value, 3) + " SECT";
    return (
      '<div class="ex-row-card">' +
      '<div class="ex-row-card-icon ex-row-card-icon--tx">' + ICO.coins + "</div>" +
      '<div class="ex-row-card-main">' +
      '<a class="ex-link ex-mono" href="#/tx/' + t.hash + '">' + shortHash(t.hash, 10, 6) + "</a>" +
      '<span class="ex-age" data-ts="' + t.timestamp + '">' + timeAgo(t.timestamp) + "</span>" +
      "</div>" +
      '<div class="ex-row-card-sub">' + addrLink(t.from) + ICO.arrowRight + addrLink(t.to) + "</div>" +
      '<div class="ex-row-card-end"><span>' + amount + "</span>" + statusPill(t.status) + "</div>" +
      "</div>"
    );
  }
  function chartCard(title, sub, svg) {
    return '<div class="ex-chart-card"><div class="ex-chart-card-head"><h4>' + title + "</h4><span>" + sub + "</span></div>" + svg + "</div>";
  }

  function renderBlocksList(page) {
    const p = paginate(BLOCKS.length, page, 25);
    const rows = BLOCKS.slice(p.start, p.end).map(blockRow).join("");
    return (
      pageHeader("Blocks", CHAIN.name + " · " + fmtInt(BLOCKS.length) + " blocks tracked this session") +
      '<div class="ex-table-wrap"><table class="ex-table">' +
      "<thead><tr><th>Block</th><th>Age</th><th>Txn</th><th>Validator</th><th>Gas Used</th><th class=\"ex-hide-sm\">Gas Limit</th><th class=\"ex-hide-sm\">Reward</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      pagerHTML("#/blocks", p.page, p.pages)
    );
  }
  function renderTxsList(page) {
    const p = paginate(TXS.length, page, 25);
    const rows = TXS.slice(p.start, p.end).map(txRow).join("");
    return (
      pageHeader("Transactions", CHAIN.name + " · " + fmtInt(TXS.length) + " transactions tracked this session") +
      '<div class="ex-table-wrap"><table class="ex-table">' +
      "<thead><tr><th>Txn Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th>Amount</th><th class=\"ex-hide-sm\">Fee</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      pagerHTML("#/txs", p.page, p.pages)
    );
  }

  function renderBlockDetail(numStr) {
    const number = parseInt(numStr, 10);
    const b = BLOCK_BY_NUM.get(number);
    if (!b) return notFound("Block", numStr);
    const txs = b.txs.map((h) => TX_BY_HASH.get(h)).filter(Boolean);
    const gasPct = ((b.gasUsed / b.gasLimit) * 100).toFixed(1);
    return (
      pageHeader("Block #" + fmtInt(b.number), "") +
      '<div class="ex-detail-card">' +
      detailRow("Block Height", '<span class="ex-mono">' + fmtInt(b.number) + "</span>" + (BLOCK_BY_NUM.has(number - 1) ? ' <a class="ex-link" href="#/block/' + (number - 1) + '">‹ Prev</a>' : "") + (BLOCK_BY_NUM.has(number + 1) ? ' <a class="ex-link" href="#/block/' + (number + 1) + '">Next ›</a>' : "")) +
      detailRow("Status", '<span class="ex-pill ex-pill--ok">' + ICO.check2 + "<span>Finalized</span></span>") +
      detailRow("Timestamp", timeAgo(b.timestamp) + ' <span class="ex-dim">(' + fmtDateTime(b.timestamp) + ")</span>") +
      detailRow("Transactions", '<a class="ex-link" href="#/txs">' + b.txCount + " transactions</a> in this block") +
      detailRow("Validator", addrLink(b.validator)) +
      detailRow("Block Reward", fmtAmount(b.reward, 5) + " SECT") +
      detailRow("Gas Used", fmtInt(b.gasUsed) + " (" + gasPct + "%)") +
      detailRow("Gas Limit", fmtInt(b.gasLimit)) +
      detailRow("Base Fee", fmtAmount(b.baseFee, 4) + " Gwei") +
      detailRow("Hash", '<span class="ex-mono ex-break">' + b.hash + "</span>" + copyBtn(b.hash)) +
      detailRow("Parent Hash", '<a class="ex-link ex-mono ex-break" href="#/block/' + (number - 1) + '">' + b.parentHash + "</a>" + copyBtn(b.parentHash)) +
      "</div>" +
      '<h3 class="ex-subhead">Transactions in this block</h3>' +
      '<div class="ex-table-wrap"><table class="ex-table">' +
      "<thead><tr><th>Txn Hash</th><th>Method</th><th>From</th><th></th><th>To</th><th>Amount</th><th class=\"ex-hide-sm\">Fee</th></tr></thead>" +
      "<tbody>" + txs.map((t) => (
        '<tr><td><a class="ex-link ex-mono" href="#/tx/' + t.hash + '">' + shortHash(t.hash) + "</a>" + copyBtn(t.hash) + "</td>" +
        "<td>" + methodPill(t.method) + "</td>" +
        "<td>" + addrLink(t.from) + "</td>" +
        '<td class="ex-dir">' + ICO.arrowRight + "</td>" +
        "<td>" + addrLink(t.to) + "</td>" +
        '<td class="ex-num">' + (t.token ? fmtAmount(t.tokenAmount, 4) + " " + t.token : fmtAmount(t.value, 4) + " SECT") + "</td>" +
        '<td class="ex-num ex-hide-sm">' + fmtAmount(t.fee, 6) + "</td></tr>"
      )).join("") + "</tbody></table></div>"
    );
  }

  function renderTxDetail(hash) {
    const t = TX_BY_HASH.get(hash.toLowerCase()) || TX_BY_HASH.get(hash);
    if (!t) return notFound("Transaction", hash);
    const amountLine = t.token
      ? fmtAmount(t.tokenAmount, 6) + " " + t.token + " <span class=\"ex-dim\">(" + esc(TOKEN_BY_SYMBOL.get(t.token.toLowerCase()).name) + ")</span>"
      : fmtAmount(t.value, 6) + " SECT";
    const sentence =
      "This transaction " + (t.status === "success" ? "transferred " : "attempted to transfer ") +
      (t.token ? fmtAmount(t.tokenAmount, 4) + " " + t.token : fmtAmount(t.value, 4) + " SECT") +
      " from " + shortAddr(t.from) + " to " + shortAddr(t.to) + " using the " + t.method + " method.";
    return (
      pageHeader("Transaction Details", "") +
      '<div class="ex-detail-card">' +
      detailRow("Transaction Hash", '<span class="ex-mono ex-break">' + t.hash + "</span>" + copyBtn(t.hash)) +
      detailRow("Status", statusPill(t.status)) +
      detailRow("Block", '<a class="ex-link ex-mono" href="#/block/' + t.blockNumber + '">' + fmtInt(t.blockNumber) + "</a>") +
      detailRow("Timestamp", timeAgo(t.timestamp) + ' <span class="ex-dim">(' + fmtDateTime(t.timestamp) + ")</span>") +
      detailRow("From", addrLink(t.from)) +
      detailRow("To", addrLink(t.to) + (isKnownContract(t.to) ? ' <span class="ex-tag">Contract</span>' : "")) +
      detailRow("Value", amountLine) +
      detailRow("Method", methodPill(t.method)) +
      detailRow("Transaction Fee", fmtAmount(t.fee, 8) + " SECT") +
      detailRow("Gas Price", fmtAmount(t.gasPrice, 3) + " Gwei") +
      detailRow("Gas Limit &amp; Usage", fmtInt(t.gasUsed) + " / " + fmtInt(t.gasLimit) + " (" + ((t.gasUsed / t.gasLimit) * 100).toFixed(1) + "%)") +
      detailRow("Nonce", fmtInt(t.nonce)) +
      detailRow("Input Data", '<div class="ex-input-data ex-mono ex-break">' + esc(t.input) + "</div>") +
      detailRow("Summary", '<p class="ex-dim">' + esc(sentence) + "</p>") +
      "</div>"
    );
  }

  function addressHoldings(addrKey) {
    const out = [];
    for (const t of TOKENS) {
      const seedVal = parseInt(addrKey.slice(2, 10), 16) + t.symbol.charCodeAt(0);
      const include = (seedVal % 5) < (isKnownContract("0x" + addrKey.slice(2)) ? 4 : 2);
      if (!include) continue;
      const bal = ((seedVal % 9973) / 9973) * (t.symbol === "SECT" ? 40000 : t.symbol === "USDX" ? 25000 : t.supply * 0.02);
      if (bal <= 0) continue;
      out.push({ token: t, balance: bal });
    }
    return out;
  }

  function renderAddress(addr, tab, page) {
    const key = addr.toLowerCase();
    const list = ADDR_TXS.get(key) || [];
    tab = tab || "txns";
    const lbl = labelFor(addr);
    const tok = TOKEN_BY_ADDR.get(key);
    const holdings = addressHoldings(key);
    const balSeed = parseInt(key.slice(2, 10), 16) % 500000;
    const balance = list.length ? (balSeed / 10000) : 0;
    let body = "";
    if (tab === "transfers") {
      const tlist = list.filter((t) => t.token);
      const p = paginate(tlist.length, page, 25);
      body =
        '<div class="ex-table-wrap"><table class="ex-table">' +
        "<thead><tr><th>Txn Hash</th><th>Age</th><th>From</th><th></th><th>To</th><th>Amount</th></tr></thead>" +
        "<tbody>" + tlist.slice(p.start, p.end).map((t) => (
          '<tr><td><a class="ex-link ex-mono" href="#/tx/' + t.hash + '">' + shortHash(t.hash) + "</a></td>" +
          '<td class="ex-age" data-ts="' + t.timestamp + '">' + timeAgo(t.timestamp) + "</td>" +
          "<td>" + addrLink(t.from) + "</td><td class=\"ex-dir\">" + ICO.arrowRight + "</td><td>" + addrLink(t.to) + "</td>" +
          '<td class="ex-num">' + fmtAmount(t.tokenAmount, 4) + " " + t.token + "</td></tr>"
        )).join("") + "</tbody></table></div>" +
        (tlist.length ? pagerHTML("#/address/" + addr + "?tab=transfers", p.page, p.pages) : emptyState("No token transfers found for this address."));
    } else {
      const p = paginate(list.length, page, 25);
      body =
        '<div class="ex-table-wrap"><table class="ex-table">' +
        "<thead><tr><th>Txn Hash</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th></th><th>To</th><th>Amount</th></tr></thead>" +
        "<tbody>" + list.slice(p.start, p.end).map((t) => (
          '<tr><td><a class="ex-link ex-mono" href="#/tx/' + t.hash + '">' + shortHash(t.hash) + "</a></td>" +
          "<td>" + methodPill(t.method) + "</td>" +
          '<td><a class="ex-link ex-mono" href="#/block/' + t.blockNumber + '">' + fmtInt(t.blockNumber) + "</a></td>" +
          '<td class="ex-age" data-ts="' + t.timestamp + '">' + timeAgo(t.timestamp) + "</td>" +
          "<td>" + addrLink(t.from) + "</td><td class=\"ex-dir\">" + ICO.arrowRight + "</td><td>" + addrLink(t.to) + "</td>" +
          '<td class="ex-num">' + (t.token ? fmtAmount(t.tokenAmount, 4) + " " + t.token : fmtAmount(t.value, 4) + " SECT") + "</td></tr>"
        )).join("") + "</tbody></table></div>" +
        (list.length ? pagerHTML("#/address/" + addr + "?tab=txns", p.page, p.pages) : emptyState("No transactions found for this address."));
    }
    return (
      pageHeader(tok ? "Token Contract" : "Address", "") +
      '<div class="ex-detail-card">' +
      detailRow("Address", '<span class="ex-mono ex-break">' + addr + "</span>" + copyBtn(addr) + (lbl ? ' <span class="ex-tag">' + esc(lbl) + "</span>" : "") + (tok ? ' <span class="ex-tag ex-tag--blue">Token Contract</span>' : "")) +
      detailRow("Balance", fmtAmount(balance, 4) + " SECT <span class=\"ex-dim\">(≈ " + fmtUsd(balance * TOKEN_BY_SYMBOL.get("sect").price) + ")</span>") +
      (holdings.length
        ? detailRow("Token Holdings", '<div class="ex-holdings">' + holdings.map((h) => '<a class="ex-holding-chip" href="#/token/' + h.token.addr + '">' + tokenIcon(h.token, 16) + esc(h.token.symbol) + ": " + fmtAmount(h.balance, 2) + "</a>").join("") + "</div>")
        : "") +
      "</div>" +
      '<div class="ex-tabs2">' +
      '<a class="ex-tab2' + (tab !== "transfers" ? " is-active" : "") + '" href="#/address/' + addr + '?tab=txns">Transactions (' + list.length + ")</a>" +
      '<a class="ex-tab2' + (tab === "transfers" ? " is-active" : "") + '" href="#/address/' + addr + '?tab=transfers">Token Transfers (' + list.filter((t) => t.token).length + ")</a>" +
      "</div>" + body
    );
  }

  function renderTokensList() {
    const rows = TOKENS.slice()
      .sort((a, b) => b.price * b.supply - a.price * a.supply)
      .map((t, i) => (
        '<tr><td>' + (i + 1) + "</td>" +
        '<td><a class="ex-link ex-token-cell" href="#/token/' + t.addr + '">' + tokenIcon(t, 24) + '<span>' + esc(t.symbol) + "<small>" + esc(t.name) + "</small></span></a></td>" +
        '<td class="ex-hide-sm">' + esc(t.kind) + "</td>" +
        '<td class="ex-num">$' + fmtAmount(t.price, 4) + "</td>" +
        '<td class="ex-num">' + fmtUsd(t.price * t.supply) + "</td>" +
        '<td class="ex-num ex-hide-sm">' + fmtInt(t.holders) + "</td>" +
        '<td class="ex-num ex-hide-sm">' + fmtAmount(t.supply, 0) + " " + esc(t.symbol) + "</td></tr>"
      ))
      .join("");
    return (
      pageHeader("Sectora Token Tracker", fmtInt(TOKENS.length) + " tokens tracked · native + tokenized real-world assets") +
      '<div class="ex-table-wrap"><table class="ex-table">' +
      "<thead><tr><th>#</th><th>Token</th><th class=\"ex-hide-sm\">Type</th><th>Price</th><th>Market Cap</th><th class=\"ex-hide-sm\">Holders</th><th class=\"ex-hide-sm\">Total Supply</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>"
    );
  }

  function renderTokenDetail(addr, tab, page) {
    const t = TOKEN_BY_ADDR.get(addr.toLowerCase());
    if (!t) return notFound("Token", addr);
    tab = tab || "transfers";
    const transfers = TOKEN_TXS.get(t.symbol) || [];
    let holdersRows = "";
    const nHolders = Math.min(20, t.holders);
    let remaining = t.supply;
    for (let i = 0; i < nHolders; i++) {
      const share = i === 0 ? 0.18 : (rand() * 0.5) / (i + 1);
      const bal = Math.min(remaining, t.supply * share * rand());
      remaining -= bal;
      const a = i < 3 ? pick(Object.values(ADDR)) : randAddress();
      holdersRows +=
        "<tr><td>" + (i + 1) + "</td><td>" + addrLink(a) + "</td>" +
        '<td class="ex-num">' + fmtAmount(bal, 3) + " " + esc(t.symbol) + "</td>" +
        '<td class="ex-num">' + ((bal / t.supply) * 100).toFixed(2) + "%</td></tr>";
    }
    let body;
    if (tab === "holders") {
      body = '<div class="ex-table-wrap"><table class="ex-table"><thead><tr><th>Rank</th><th>Address</th><th>Balance</th><th>% Supply</th></tr></thead><tbody>' + holdersRows + "</tbody></table></div>";
    } else {
      const p = paginate(transfers.length, page, 25);
      body =
        '<div class="ex-table-wrap"><table class="ex-table">' +
        "<thead><tr><th>Txn Hash</th><th>Age</th><th>From</th><th></th><th>To</th><th>Amount</th></tr></thead>" +
        "<tbody>" + transfers.slice(p.start, p.end).map((tx) => (
          '<tr><td><a class="ex-link ex-mono" href="#/tx/' + tx.hash + '">' + shortHash(tx.hash) + "</a></td>" +
          '<td class="ex-age" data-ts="' + tx.timestamp + '">' + timeAgo(tx.timestamp) + "</td>" +
          "<td>" + addrLink(tx.from) + "</td><td class=\"ex-dir\">" + ICO.arrowRight + "</td><td>" + addrLink(tx.to) + "</td>" +
          '<td class="ex-num">' + fmtAmount(tx.tokenAmount, 4) + " " + esc(t.symbol) + "</td></tr>"
        )).join("") + "</tbody></table></div>" +
        (transfers.length ? pagerHTML("#/token/" + addr + "?tab=transfers", p.page, p.pages) : emptyState("No transfers found for this token yet."));
    }
    return (
      pageHeader(t.name + " (" + t.symbol + ")", esc(t.kind)) +
      '<div class="ex-detail-card ex-detail-card--token">' +
      '<div class="ex-token-head">' + tokenIcon(t, 44) + '<div><h2>' + esc(t.name) + '</h2><span class="ex-dim">' + esc(t.symbol) + " · " + esc(t.kind) + "</span></div></div>" +
      detailRow("Contract Address", '<span class="ex-mono ex-break">' + t.addr + "</span>" + copyBtn(t.addr)) +
      detailRow("Price", "$" + fmtAmount(t.price, 4)) +
      detailRow("Market Cap", fmtUsd(t.price * t.supply)) +
      detailRow("Total Supply", fmtAmount(t.supply, 0) + " " + esc(t.symbol)) +
      detailRow("Holders", fmtInt(t.holders)) +
      detailRow("Decimals", "18") +
      "</div>" +
      '<div class="ex-tabs2">' +
      '<a class="ex-tab2' + (tab !== "holders" ? " is-active" : "") + '" href="#/token/' + addr + '?tab=transfers">Transfers (' + transfers.length + ")</a>" +
      '<a class="ex-tab2' + (tab === "holders" ? " is-active" : "") + '" href="#/token/' + addr + '?tab=holders">Holders (' + t.holders + ")</a>" +
      "</div>" + body
    );
  }

  function renderGasTracker() {
    const low = 0.8 + rand() * 0.3, avg = 1.4 + rand() * 0.4, high = 2.4 + rand() * 0.8;
    const hist = days14Values(1.6, 0.5);
    return (
      pageHeader("Sectora Gas Tracker", "Estimated gas prices for the next block on " + CHAIN.name) +
      '<div class="ex-gas-grid">' +
      gasCard("Low", low, "~4 sec", "gray") +
      gasCard("Average", avg, "~2 sec", "blue") +
      gasCard("High", high, "~1 sec", "green") +
      "</div>" +
      chartCard("Gas Price History", "14 Days · Gwei", lineChart(hist, { color: "var(--ex-blue)" })) +
      '<p class="ex-dim ex-gastext">Sectora is a ' + CHAIN.layer + ' network, so gas fees settle at a small fraction of a cent — base fees shown here are denominated in the network’s own Gwei-equivalent unit.</p>'
    );
  }
  function gasCard(label, gwei, eta, tone) {
    return (
      '<div class="ex-gas-card ex-gas-card--' + tone + '">' + ICO.fuel +
      '<div class="ex-gas-label">' + label + "</div>" +
      '<div class="ex-gas-value">' + fmtAmount(gwei, 2) + " <small>Gwei</small></div>" +
      '<div class="ex-gas-eta">' + eta + "</div></div>"
    );
  }

  function renderCharts() {
    return (
      pageHeader("Charts &amp; Statistics", "Network activity across " + CHAIN.name) +
      '<div class="ex-charts-grid">' +
      chartCard("Daily Transactions", "14 Days", barChart(DAILY_TX, { color: "var(--ex-blue)" })) +
      chartCard("Daily Active Addresses", "14 Days", barChart(DAILY_ADDR, { color: "var(--ex-purple)" })) +
      chartCard("SECT Price", "30 Days", lineChart(PRICE_HIST, { color: "var(--ex-green)" })) +
      chartCard("Total Value Tokenized", "14 Days", lineChart(TVL_HIST, { color: "var(--ex-gold)" })) +
      "</div>"
    );
  }

  function pageHeader(title, sub) {
    return '<div class="ex-page-head"><h1>' + title + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>";
  }
  function detailRow(label, valueHtml) {
    return '<div class="ex-detail-row"><div class="ex-detail-label">' + label + '</div><div class="ex-detail-value">' + valueHtml + "</div></div>";
  }
  function emptyState(msg) {
    return '<div class="ex-empty">' + msg + "</div>";
  }
  function notFound(kind, q) {
    return (
      pageHeader(kind + " Not Found", "") +
      '<div class="ex-empty ex-empty--big">No matching ' + kind.toLowerCase() + ' record found for <span class="ex-mono">' + esc(q) + '</span>.<br><a class="ex-link" href="#/">Return home</a></div>'
    );
  }

  /* ============================================================
     Search
     ============================================================ */
  function handleSearch(raw, errEl) {
    const q = (raw || "").trim();
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    if (!q) return;
    if (/^\d+$/.test(q)) {
      location.hash = "#/block/" + q;
      return;
    }
    if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
      location.hash = "#/tx/" + q.toLowerCase();
      return;
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      location.hash = "#/address/" + q.toLowerCase();
      return;
    }
    const bySymbol = TOKEN_BY_SYMBOL.get(q.toLowerCase());
    if (bySymbol) { location.hash = "#/token/" + bySymbol.addr; return; }
    const byName = TOKENS.find((t) => t.name.toLowerCase().includes(q.toLowerCase()));
    if (byName) { location.hash = "#/token/" + byName.addr; return; }
    if (errEl) { errEl.hidden = false; errEl.textContent = 'No matching records found for "' + q + '".'; }
    else alert('No matching records found for "' + q + '".');
  }

  /* ============================================================
     Main render / router
     ============================================================ */
  const mainEl = () => document.getElementById("exMain");

  function render(opts) {
    const preserveScroll = !!(opts && opts.preserveScroll);
    const { parts, params } = parseRoute();
    const view = parts[0] || "home";
    const page = parseInt(params.get("page") || "1", 10);
    let html;
    switch (view) {
      case "home":
      case "":
        html = renderHome();
        break;
      case "blocks":
        html = renderBlocksList(page);
        break;
      case "block":
        html = renderBlockDetail(parts[1]);
        break;
      case "txs":
        html = renderTxsList(page);
        break;
      case "tx":
        html = renderTxDetail(parts[1] || "");
        break;
      case "address":
        html = renderAddress(parts[1] || "", params.get("tab"), page);
        break;
      case "tokens":
        html = renderTokensList();
        break;
      case "token":
        html = renderTokenDetail(parts[1] || "", params.get("tab"), page);
        break;
      case "gastracker":
        html = renderGasTracker();
        break;
      case "charts":
        html = renderCharts();
        break;
      default:
        html = notFound("Page", view);
    }
    const el = mainEl();
    if (el) el.innerHTML = html;
    updateNavActive(view);
    if (!preserveScroll) window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    updateAges();
  }

  function updateNavActive(view) {
    document.querySelectorAll(".ex-navlink").forEach((a) => {
      const match = a.getAttribute("data-view");
      a.classList.toggle("is-active", match === view || (match === "home" && (view === "" || view === "home")));
    });
  }

  function updateAges() {
    document.querySelectorAll(".ex-age").forEach((el) => {
      const ts = parseInt(el.getAttribute("data-ts"), 10);
      if (!isNaN(ts)) el.textContent = timeAgo(ts);
    });
  }

  /* ============================================================
     Header ticker (live, persists across route changes)
     ============================================================ */
  function updateHeaderTicker() {
    const sect = TOKEN_BY_SYMBOL.get("sect");
    const bh = document.getElementById("exTickerBlock");
    const gp = document.getElementById("exTickerGas");
    const pr = document.getElementById("exTickerPrice");
    if (bh) bh.textContent = fmtInt(currentTip);
    if (gp) gp.textContent = fmtAmount(1.2 + rand() * 0.8, 2) + " Gwei";
    if (pr) pr.textContent = "$" + fmtAmount(sect.price, 4);
  }

  /* ============================================================
     Token price jitter (keeps the RWA section feeling alive)
     ============================================================ */
  TOKENS.forEach((t) => { t.baseline = t.price; });
  function jitterPrices() {
    TOKENS.forEach((t) => {
      const drift = (rand() - 0.5) * 0.004;
      t.price = Math.max(t.baseline * 0.85, t.price * (1 + drift));
    });
  }

  /* ============================================================
     Event wiring
     ============================================================ */
  function wireEvents() {
    document.addEventListener("click", (e) => {
      const copyEl = e.target.closest(".ex-copy");
      if (copyEl) {
        const text = copyEl.getAttribute("data-copy");
        if (navigator.clipboard && text) {
          navigator.clipboard.writeText(text).then(() => {
            copyEl.classList.add("is-copied");
            const prev = copyEl.innerHTML;
            copyEl.innerHTML = ICO.check;
            setTimeout(() => { copyEl.innerHTML = prev; copyEl.classList.remove("is-copied"); }, 1100);
          }).catch(() => {});
        }
      }
    });

    const headerForm = document.getElementById("exHeaderSearch");
    if (headerForm) {
      headerForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("exHeaderSearchInput");
        handleSearch(input.value, null);
      });
    }

    document.addEventListener("submit", (e) => {
      if (e.target && e.target.id === "exHeroSearch") {
        e.preventDefault();
        const input = document.getElementById("exHeroSearchInput");
        const err = document.getElementById("exHeroError");
        handleSearch(input.value, err);
      }
    });

    const navToggle = document.getElementById("exNavToggle");
    const navMobile = document.getElementById("exNavMobile");
    if (navToggle && navMobile) {
      navToggle.addEventListener("click", () => {
        const open = navMobile.classList.toggle("is-open");
        navToggle.classList.toggle("is-open", open);
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      });
      navMobile.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
        navMobile.classList.remove("is-open");
        navToggle.classList.remove("is-open");
      }));
    }

    const themeToggle = document.getElementById("exThemeToggle");
    if (themeToggle) {
      const syncLabel = () => {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
      };
      syncLabel();
      themeToggle.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
        else document.documentElement.removeAttribute("data-theme");
        try { localStorage.setItem("sectorascanTheme", next); } catch (e) {}
        syncLabel();
      });
    }

    window.addEventListener("hashchange", () => render());
  }

  function init() {
    if (!location.hash) location.hash = "#/";
    wireEvents();
    render();
    updateHeaderTicker();
    setInterval(() => { pushLiveBlock(); }, CHAIN.blockTimeMs);
    setInterval(() => {
      const { parts, params } = parseRoute();
      const view = parts[0] || "home";
      const page = parseInt(params.get("page") || "1", 10);
      if (view === "" || view === "home" || ((view === "blocks" || view === "txs") && page === 1)) {
        render({ preserveScroll: true });
      } else {
        updateAges();
      }
      updateHeaderTicker();
    }, CHAIN.blockTimeMs);
    setInterval(() => { jitterPrices(); if ((parseRoute().parts[0] || "home") === "home") render({ preserveScroll: true }); }, 3200);
    setInterval(updateAges, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
