(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function randHex(len) {
    let s = "";
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function fmtAddr(addr) { return addr.slice(0, 6) + "…" + addr.slice(-4); }
  function fmtUSD(n, decimals) {
    decimals = decimals === undefined ? 2 : decimals;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtInt(n) { return Math.round(n).toLocaleString("en-US"); }

  const walletAddr = "0x" + randHex(40);
  const addrEls = [document.getElementById("v3-wallet-addr"), document.getElementById("v3-actions-addr")];
  addrEls.forEach((el) => { if (el) el.textContent = fmtAddr(walletAddr); });

  // ---- shared spark builder (line + fill), with optional endpoint ----
  function buildSpark(series, w, h, padTop, padBottom) {
    padTop = padTop || 4;
    padBottom = padBottom || 4;
    const max = Math.max.apply(null, series);
    const min = Math.min.apply(null, series);
    const span = (max - min) || 1;
    const usableH = h - padTop - padBottom;
    const stepX = w / (series.length - 1);
    let line = "";
    series.forEach((v, i) => {
      const x = i * stepX;
      const y = padTop + usableH - ((v - min) / span) * usableH;
      line += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    });
    const fill = "M0 " + h + " " + line.replace("M", "L") + "L" + w + " " + h + " Z";
    return { line: line.trim(), fill };
  }
  function walk(base, n, vol, min, max) {
    const arr = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v = clamp(v + rand(-vol, vol), min, max);
      arr.push(v);
    }
    return arr;
  }

  // ---- Evaluation hero chart ----
  const evalSeries = walk(24500, 60, 420, 21000, 29000);
  const evalChart = document.getElementById("v3-eval-chart");
  const evalLine = document.getElementById("v3-eval-line");
  const evalFill = document.getElementById("v3-eval-fill");
  const evalTip = document.getElementById("v3-eval-tip");
  const evalValueEl = document.getElementById("v3-eval-value");
  const evalPctEl = document.getElementById("v3-eval-pct");
  const evalUsdEl = document.getElementById("v3-eval-usd");

  function renderEval() {
    const { line, fill } = buildSpark(evalSeries, 720, 168, 14, 10);
    if (evalLine) evalLine.setAttribute("d", line);
    if (evalFill) evalFill.setAttribute("d", fill);
    const current = evalSeries[evalSeries.length - 1];
    const first = evalSeries[0];
    const pct = ((current - first) / first) * 100;
    if (evalValueEl) evalValueEl.textContent = fmtUSD(current);
    if (evalPctEl) {
      evalPctEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      evalPctEl.className = "v3-pill " + (pct >= 0 ? "v3-pill--green" : "v3-pill--red");
    }
    if (evalUsdEl) evalUsdEl.textContent = fmtUSD(Math.abs(current - first));

    // position the "Earned" tooltip near the most recent peak
    let peakIdx = 0;
    for (let i = 1; i < evalSeries.length; i++) if (evalSeries[i] > evalSeries[peakIdx]) peakIdx = i;
    const stepX = 720 / (evalSeries.length - 1);
    const max = Math.max.apply(null, evalSeries);
    const min = Math.min.apply(null, evalSeries);
    const span = (max - min) || 1;
    const usableH = 168 - 24;
    const px = peakIdx * stepX;
    const py = 14 + usableH - ((evalSeries[peakIdx] - min) / span) * usableH;
    if (evalTip) {
      const leftPct = clamp((px / 720) * 100, 10, 90);
      evalTip.style.left = leftPct + "%";
      evalTip.style.top = py + "px";
      evalTip.textContent = "Earned +" + fmtUSD(Math.max(0, current - min), 2);
    }
  }
  renderEval();
  setInterval(() => {
    evalSeries.push(clamp(evalSeries[evalSeries.length - 1] + rand(-420, 460), 21000, 29000));
    if (evalSeries.length > 60) evalSeries.shift();
    renderEval();
  }, 3200);

  // ---- Recent operations (+ click-through drawer) ----
  const OPS = [
    { name: "Polygon", desc: "Sent", amt: -4141, color: "#8b5cf6", icon: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/>' },
    { name: "RWA Bridge", desc: "Swapped", amt: -5151, color: "#ff7a1a", icon: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>' },
    { name: "WalletConnect", desc: "Received", amt: 1613, color: "#3b82f6", icon: '<path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5Z"/>' },
    { name: "#SECT Stake", desc: "Reward", amt: 613, color: "#94ff45", textDark: true, icon: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  ];
  const opsListEl = document.getElementById("v3-ops-list");
  const opsTotalEl = document.getElementById("v3-ops-total");
  const opsPerDayEl = document.getElementById("v3-ops-perday");
  let opsTotal = 0;
  OPS.forEach((op) => { opsTotal += Math.abs(op.amt); });
  if (opsTotalEl) opsTotalEl.textContent = fmtUSD(opsTotal, 2).replace(/\.00$/, ".47");
  if (opsPerDayEl) opsPerDayEl.textContent = fmtUSD(opsTotal / 3.7, 2).replace(/\.00$/, ".51") + " / day";

  if (opsListEl) {
    OPS.forEach((op, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "v3-op-row";
      row.innerHTML =
        '<span class="v3-op-icon" style="background:' + op.color + (op.textDark ? ";color:#06210a" : "") + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + op.icon + '</svg></span>' +
        '<span class="v3-op-mid"><span class="v3-op-name">' + op.name + '</span><br><span class="v3-op-desc">' + op.desc + '</span></span>' +
        '<span class="v3-op-amt">' + (op.amt >= 0 ? "+" : "-") + "$" + Math.abs(op.amt).toLocaleString("en-US") + '</span>';
      row.addEventListener("click", () => openDrawer(op, i));
      opsListEl.appendChild(row);
    });
  }

  // ---- order detail drawer ----
  const overlay = document.getElementById("v3Overlay");
  const drawer = document.getElementById("v3Drawer");
  const drawerClose = document.getElementById("v3DrawerClose");

  function openDrawer(op, i) {
    const id = "53" + (2000 + i * 137 + Math.floor(rand(0, 99)));
    const txid = "0x" + randHex(58);
    const addr = "0x" + randHex(40);
    const now = new Date();
    const fmtTime = (d) => d.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

    document.getElementById("v3-drawer-id").textContent = "#" + id;
    document.getElementById("v3-drawer-amt").textContent = (op.amt >= 0 ? "+" : "-") + "$" + Math.abs(op.amt).toLocaleString("en-US") + ".00";
    document.getElementById("v3-drawer-status").textContent = "In progress";
    document.getElementById("v3-drawer-tracking").textContent = "fs" + randHex(14);
    document.getElementById("v3-drawer-network").innerHTML = '<span class="v3-drawer-badge">Testnet</span>';
    document.getElementById("v3-drawer-time").textContent = fmtTime(now);
    document.getElementById("v3-drawer-address").textContent = addr;
    document.getElementById("v3-drawer-txid").textContent = txid;
    document.getElementById("v3-drawer-depositwallet").textContent = "Spot wallet";

    const steps = [
      { label: "Initiated request", done: true, mins: 0 },
      { label: "Transaction processing", done: true, mins: 16 },
      { label: "Blockchain confirmation", done: false, warn: true, mins: 46 },
      { label: "Transfer completed", done: false, mins: null },
    ];
    const tlEl = document.getElementById("v3-timeline");
    tlEl.innerHTML = "";
    steps.forEach((s) => {
      const t = new Date(now.getTime() + (s.mins || 0) * 60000);
      const timeLabel = s.mins === null ? "Pending" : fmtTime(t);
      const dotClass = s.done ? "is-done" : s.warn ? "is-warn" : "";
      const icon = s.done
        ? '<path d="M20 6 9 17l-5-5"/>'
        : s.warn
        ? '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
        : '<path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5Z"/>';
      const item = document.createElement("div");
      item.className = "v3-tl-item";
      item.innerHTML =
        '<span class="v3-tl-dot ' + dotClass + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</svg></span>' +
        '<span><span class="v3-tl-time">' + timeLabel + '</span><br><span class="v3-tl-label">' + s.label + '</span></span>';
      tlEl.appendChild(item);
    });

    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
  }
  function closeDrawer() {
    overlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
  }
  if (overlay) overlay.addEventListener("click", closeDrawer);
  if (drawerClose) drawerClose.addEventListener("click", closeDrawer);

  // ---- BTC glow card ----
  const btcSeries = walk(96000, 30, 900, 92000, 100000);
  function renderBtc() {
    const { line, fill } = buildSpark(btcSeries, 260, 56, 4, 2);
    document.getElementById("v3-btc-line").setAttribute("d", line);
    document.getElementById("v3-btc-fill").setAttribute("d", fill);
    const current = btcSeries[btcSeries.length - 1];
    const first = btcSeries[0];
    const pct = ((current - first) / first) * 100;
    document.getElementById("v3-btc-price").textContent = fmtUSD(current, 0);
    document.getElementById("v3-btc-delta").textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
  }
  renderBtc();
  setInterval(() => {
    btcSeries.push(clamp(btcSeries[btcSeries.length - 1] + rand(-900, 950), 92000, 100000));
    if (btcSeries.length > 30) btcSeries.shift();
    renderBtc();
  }, 4000);

  // ---- mini wallet + RWA glow card ----
  const sectPrice = 0.1;
  const walletSect = rand(1800, 6200);
  document.getElementById("v3-mini-wallet-addr").textContent = fmtAddr(walletAddr);
  document.getElementById("v3-mini-wallet-amt").textContent = walletSect.toFixed(2) + " #SECT";
  document.getElementById("v3-mini-wallet-usd").textContent = fmtUSD(walletSect * sectPrice, 2);

  const rwaSeries = walk(101.4, 26, 0.35, 98.5, 103);
  function renderRwa() {
    const { line, fill } = buildSpark(rwaSeries, 260, 56, 4, 2);
    document.getElementById("v3-rwa-line").setAttribute("d", line);
    document.getElementById("v3-rwa-fill").setAttribute("d", fill);
    document.getElementById("v3-rwa-low").textContent = fmtUSD(Math.min.apply(null, rwaSeries), 2);
    document.getElementById("v3-rwa-high").textContent = fmtUSD(Math.max.apply(null, rwaSeries), 2);
  }
  renderRwa();
  setInterval(() => {
    rwaSeries.push(clamp(rwaSeries[rwaSeries.length - 1] + rand(-0.35, 0.32), 98.5, 103));
    if (rwaSeries.length > 26) rwaSeries.shift();
    renderRwa();
  }, 4500);

  // ---- Fear & greed gauge ----
  const fgDotsEl = document.getElementById("v3-fg-dots");
  const TOTAL_DOTS = 45;
  let fgValue = Math.floor(rand(60, 82));
  function renderFg() {
    const lit = Math.round((fgValue / 100) * TOTAL_DOTS);
    fgDotsEl.innerHTML = "";
    for (let i = 0; i < TOTAL_DOTS; i++) {
      const dot = document.createElement("span");
      dot.className = "v3-fg-dot" + (i < lit ? " is-lit" : "");
      fgDotsEl.appendChild(dot);
    }
    const word = fgValue > 74 ? "Extreme Greed" : fgValue > 55 ? "Greed" : fgValue > 45 ? "Neutral" : fgValue > 25 ? "Fear" : "Extreme Fear";
    document.getElementById("v3-fg-word").textContent = fgValue + " " + word;
    document.getElementById("v3-fg-num").textContent = String(fgValue);
  }
  renderFg();
  setInterval(() => {
    fgValue = Math.round(clamp(fgValue + rand(-4, 4), 10, 95));
    renderFg();
  }, 6000);

  // ---- Sectora wallet mini card ----
  let phantomAmt = rand(4200, 6200);
  document.getElementById("v3-phantom-amt").textContent = fmtUSD(phantomAmt, 2);
  setInterval(() => {
    phantomAmt = clamp(phantomAmt + rand(-40, 60), 3000, 9000);
    document.getElementById("v3-phantom-amt").textContent = fmtUSD(phantomAmt, 2);
  }, 5000);

  // ---- LTC bar card ----
  const MONTHS = ["Sep.", "Oct.", "Nov.", "Dec.", "Jan."];
  function renderLtcBars() {
    const values = MONTHS.map(() => rand(65, 92));
    const hiIdx = values.indexOf(Math.max.apply(null, values));
    const barsEl = document.getElementById("v3-ltc-bars");
    const labelsEl = document.getElementById("v3-ltc-labels");
    const valuesEl = document.getElementById("v3-ltc-values");
    barsEl.innerHTML = "";
    labelsEl.innerHTML = "";
    valuesEl.innerHTML = "";
    const max = Math.max.apply(null, values);
    values.forEach((v, i) => {
      const col = document.createElement("div");
      col.className = "v3-bar-col" + (i === hiIdx ? " is-hi" : "");
      const fill = document.createElement("div");
      fill.className = "v3-bar-fill";
      fill.style.height = reduced ? (v / max * 100) + "%" : "4%";
      col.appendChild(fill);
      barsEl.appendChild(col);
      if (!reduced) requestAnimationFrame(() => { fill.style.height = (v / max * 100) + "%"; });

      const lbl = document.createElement("span");
      lbl.textContent = MONTHS[i];
      labelsEl.appendChild(lbl);

      const val = document.createElement("span");
      val.textContent = "$" + v.toFixed(2);
      if (i === MONTHS.length - 1 && v < values[i - 1]) val.className = "is-red";
      valuesEl.appendChild(val);
    });
  }
  renderLtcBars();
  let ltcPrice = rand(60, 95);
  let ltcAmt = rand(20, 30);
  function renderLtcTop() {
    const pct = rand(-2, 8);
    document.getElementById("v3-ltc-price").textContent = fmtUSD(ltcPrice, 2);
    document.getElementById("v3-ltc-amt").textContent = ltcAmt.toFixed(2) + " LTC";
    const deltaEl = document.getElementById("v3-ltc-delta");
    deltaEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
    deltaEl.className = "v3-pill " + (pct >= 0 ? "v3-pill--green" : "v3-pill--red");
  }
  renderLtcTop();
  setInterval(() => {
    ltcPrice = clamp(ltcPrice + rand(-3, 3), 55, 100);
    renderLtcTop();
  }, 5000);
  setInterval(renderLtcBars, 12000);
})();
