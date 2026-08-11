(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- hero band equalizer bars (same visual language as the main site's
  // "Live on Testnet" section) ----
  (() => {
    const container = document.getElementById("dashHeroBars");
    if (!container) return;
    const BAR_COUNT = 150;
    const bars = [];
    let html = "";
    for (let i = 0; i < BAR_COUNT; i++) html += '<div class="dash-heroband-bar"></div>';
    container.innerHTML = html;
    container.querySelectorAll(".dash-heroband-bar").forEach((bar) => bars.push(bar));

    function randomHeight() {
      if (Math.random() < 0.16) return 55 + Math.random() * 40;
      return 4 + Math.random() * 34;
    }
    function tick() {
      bars.forEach((bar) => {
        if (Math.random() < 0.5) bar.style.height = Math.min(96, randomHeight()) + "%";
      });
    }
    tick();
    if (!reduced) setInterval(tick, 200);
  })();

  // ---- formatting helpers ----
  function t(key, fallback) {
    return window.SECTORA_T ? window.SECTORA_T(key) : fallback;
  }
  function fmtInt(n) {
    return Math.round(n).toLocaleString("en-US");
  }
  function fmtUSD(n) {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(2);
  }
  function fmtAddr(addr) {
    return addr.slice(0, 8) + "…" + addr.slice(-6);
  }
  function randHex(len) {
    let s = "";
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // ---- validator node map: real country borders (Natural Earth 110m,
  // self-hosted, same resolution/source family as the 3D globe) ----
  (() => {
    const g = document.getElementById("dmapCountries");
    const topo = window.SECTORA_MAP_TOPOLOGY;
    if (!g || !topo) return;

    const NORTH = 83, SOUTH = -58;
    function project(lon, lat) {
      const x = (lon + 180) / 360 * 1000;
      const y = (NORTH - lat) / (NORTH - SOUTH) * 391.7;
      return [x, y];
    }

    const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
    const arcs = topo.arcs.map((arc) => {
      let x = 0, y = 0;
      return arc.map((d) => { x += d[0]; y += d[1]; return [x * sx + tx, y * sy + ty]; });
    });
    function ring(idx) {
      const out = [];
      for (const i of idx) {
        const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]);
      }
      return out;
    }
    function unwrap(r) {
      const out = [[r[0][0], r[0][1]]];
      for (let i = 1; i < r.length; i++) {
        let lon = r[i][0];
        const prev = out[i - 1][0];
        while (lon - prev > 180) lon -= 360;
        while (prev - lon > 180) lon += 360;
        out.push([lon, r[i][1]]);
      }
      return out;
    }

    const frag = document.createDocumentFragment();
    for (const geom of topo.objects.countries.geometries) {
      const polys =
        geom.type === "MultiPolygon" ? geom.arcs.map((p) => p.map(ring)) :
        geom.type === "Polygon" ? [geom.arcs.map(ring)] : [];
      let d = "";
      for (const poly of polys) {
        const rings = poly.map(unwrap);
        for (const r of rings) {
          let lo = Infinity, hi = -Infinity;
          for (const p of r) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }
          const offsets = [0];
          if (hi > 180) offsets.push(-360);
          if (lo < -180) offsets.push(360);
          for (const off of offsets) {
            let sub = "";
            for (let i = 0; i < r.length; i++) {
              const [x, y] = project(r[i][0] + off, r[i][1]);
              sub += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1) + " ";
            }
            d += sub + "Z ";
          }
        }
      }
      if (d) {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("class", "dmap-country");
        path.setAttribute("d", d.trim());
        frag.appendChild(path);
      }
    }
    g.appendChild(frag);
  })();

  // ---- validator node map (reuses the site's world map coordinate set) ----
  const NODE_POSITIONS = [
    [162.8, 105.5], [490.0, 80.6], [523.1, 100.6], [529.7, 88.8],
    [650.7, 163.4], [794.0, 129.0], [515.7, 85.7], [881.0, 127.2],
    [470.2, 132.2], [854.1, 128.6], [247.5, 49.4], [872.8, 300.3],
    [732.2, 164.0], [478.5, 81.9], [546.0, 56.3], [341.9, 257.4],
    [597.7, 141.5], [551.7, 31.3], [487.6, 119.0], [571.6, 48.7],
    [534.5, 113.8], [528.3, 74.7], [570.0, 310.4], [512.7, 89.9],
  ];
  function regionFor(x) {
    if (x < 330) return t("dashboard.map.regionAmericas", "Americas");
    if (x < 650) return t("dashboard.map.regionEuropeAfrica", "Europe / Africa");
    return t("dashboard.map.regionAsiaPacific", "Asia-Pacific");
  }
  function renderNodeTooltips() {
    document.querySelectorAll(".dmap-node[data-x]").forEach((node) => {
      const x = Number(node.dataset.x);
      node.title = t("dashboard.map.nodeTooltip", "Validator node — {region}").replace("{region}", regionFor(x));
    });
  }

  const mapFrame = document.getElementById("dashMapFrame");
  const mapNodesEl = document.getElementById("dashMapNodes");
  const nodeCountEl = document.getElementById("dashNodeCount");

  if (mapNodesEl) {
    const frag = document.createDocumentFragment();
    NODE_POSITIONS.forEach(([x, y]) => {
      const node = document.createElement("div");
      node.className = "dmap-node";
      node.dataset.x = String(x);
      node.style.left = (x / 1000 * 100) + "%";
      node.style.top = (y / 391.7 * 100) + "%";
      node.innerHTML = '<span class="dmap-node-ring"></span><span class="dmap-node-core"></span>';
      frag.appendChild(node);
    });
    mapNodesEl.appendChild(frag);
    renderNodeTooltips();
  }
  if (nodeCountEl) nodeCountEl.textContent = String(NODE_POSITIONS.length);

  // ---- epoch ring ----
  const EPOCH_LEN_S = 90;
  let epochNum = 4128;
  let epochStart = Date.now();
  const ringEl = document.getElementById("dashEpochRing");
  const epochNumEl = document.getElementById("dashEpochNum");
  const epochEtaEl = document.getElementById("dashEpochEta");
  const epochBarEl = document.getElementById("dashEpochBar");
  const RING_CIRC = 138.2;

  function tickEpoch() {
    const elapsed = (Date.now() - epochStart) / 1000;
    let p = elapsed / EPOCH_LEN_S;
    if (p >= 1) {
      epochNum += 1;
      epochStart = Date.now();
      p = 0;
    }
    if (ringEl) ringEl.style.strokeDashoffset = String(RING_CIRC * (1 - p));
    if (epochBarEl) epochBarEl.style.width = (p * 100).toFixed(1) + "%";
    if (epochNumEl) epochNumEl.textContent = "#" + fmtInt(epochNum);
    if (epochEtaEl) {
      const remaining = Math.max(0, Math.round(EPOCH_LEN_S - elapsed % EPOCH_LEN_S));
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      epochEtaEl.textContent = t("dashboard.validator.nextIn", "next in {time}").replace("{time}", mm + ":" + ss);
    }
  }
  tickEpoch();
  setInterval(tickEpoch, 1000);

  // ---- selected validator card ----
  const VALIDATORS = [
    "sectora-node-lux", "sectora-node-atlas", "sectora-node-vega",
    "sectora-node-orion", "sectora-node-nova", "sectora-node-halo",
    "sectora-node-quartz", "sectora-node-ember",
  ];
  function pickValidator() {
    const name = VALIDATORS[Math.floor(Math.random() * VALIDATORS.length)];
    return {
      name,
      addr: "0x" + randHex(40),
      uptime: rand(98.2, 99.99),
      commission: rand(3, 8),
      stake: rand(180000, 640000),
      blocks: Math.floor(rand(1200, 9800)),
      rank: Math.floor(rand(1, 119)),
    };
  }
  function renderValidator(v) {
    const avatar = document.getElementById("dashValAvatar");
    const name = document.getElementById("dashValName");
    const addr = document.getElementById("dashValAddr");
    const uptime = document.getElementById("dashValUptime");
    const commission = document.getElementById("dashValCommission");
    const stake = document.getElementById("dashValStake");
    const blocks = document.getElementById("dashValBlocks");
    const rank = document.getElementById("dashValRank");
    if (avatar) avatar.textContent = v.name.replace("sectora-node-", "")[0].toUpperCase();
    if (name) name.textContent = v.name;
    if (addr) addr.textContent = fmtAddr(v.addr);
    if (uptime) uptime.textContent = v.uptime.toFixed(2) + "%";
    if (commission) commission.textContent = v.commission.toFixed(1) + "%";
    if (stake) stake.textContent = fmtInt(v.stake);
    if (blocks) blocks.textContent = fmtInt(v.blocks);
    if (rank) rank.textContent = "#" + v.rank + " / 118";
  }
  let currentValidator = pickValidator();
  renderValidator(currentValidator);
  setInterval(() => {
    currentValidator = pickValidator();
    renderValidator(currentValidator);
  }, 14000);

  const copyBtn = document.getElementById("dashCopyAddr");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const label = copyBtn.querySelector("span");
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentValidator.addr).catch(() => {});
      }
      if (label) {
        const original = label.textContent;
        label.textContent = t("dashboard.validator.copied", "Copied!");
        setTimeout(() => { label.textContent = original; }, 1600);
      }
    });
  }

  // ---- network stats (KPI cards) ----
  function seedWalk(base, n, vol) {
    const arr = [];
    let v = base;
    for (let i = 0; i < n; i++) {
      v = Math.max(0, v + rand(-vol, vol));
      arr.push(v);
    }
    return arr;
  }
  function buildSparkDot(series, w, h) {
    const max = Math.max.apply(null, series) * 1.08;
    const min = Math.min.apply(null, series) * 0.92;
    const span = max - min || 1;
    const stepX = w / (series.length - 1);
    let line = "";
    let dotX = 0, dotY = 0;
    series.forEach((v, i) => {
      const x = i * stepX;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      line += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      dotX = x;
      dotY = y;
    });
    const fill = "M0 " + h + " " + line.replace("M", "L") + "L" + w + " " + h + " Z";
    return { line: line.trim(), fill, dotX, dotY };
  }
  function renderKpiCard(key, valueElId, series, value, prevValue, fmt) {
    const { line, fill, dotX, dotY } = buildSparkDot(series, 120, 34);
    const lineEl = document.getElementById("line-" + key);
    const fillEl = document.getElementById("fill-" + key);
    const dotEl = document.getElementById("dot-" + key);
    const deltaEl = document.getElementById("delta-" + key);
    const valueEl = document.getElementById(valueElId);
    if (lineEl) lineEl.setAttribute("d", line);
    if (fillEl) fillEl.setAttribute("d", fill);
    if (dotEl) { dotEl.setAttribute("cx", dotX.toFixed(1)); dotEl.setAttribute("cy", dotY.toFixed(1)); }
    if (valueEl) valueEl.textContent = fmt(value);
    if (deltaEl) {
      const pct = ((value - prevValue) / (prevValue || 1)) * 100;
      deltaEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      deltaEl.className = "metric-delta " + (pct >= 0 ? "is-up" : "is-down");
    }
  }

  let stats = { validators: 118, contracts: 3420, cities: 46 };
  const kpiValidatorsSeries = seedWalk(stats.validators, 16, 3);
  const kpiContractsSeries = seedWalk(stats.contracts, 16, 25);
  let kpiValidatorsPrev = stats.validators;
  let kpiContractsPrev = stats.contracts;

  function renderStats() {
    const ci = document.getElementById("dashStatCities");
    if (ci) ci.textContent = fmtInt(stats.cities);
    renderKpiCard("kpiValidators", "dashKpiValidators", kpiValidatorsSeries, stats.validators, kpiValidatorsPrev, fmtInt);
    renderKpiCard("kpiContracts", "dashKpiContracts", kpiContractsSeries, stats.contracts, kpiContractsPrev, fmtInt);
  }
  renderStats();
  setInterval(() => {
    kpiValidatorsPrev = stats.validators;
    kpiContractsPrev = stats.contracts;
    stats.contracts += Math.floor(rand(1, 6));
    if (Math.random() < 0.15) stats.validators += Math.random() < 0.5 ? 1 : -1;
    stats.validators = clamp(stats.validators, 96, 140);
    kpiValidatorsSeries.push(stats.validators);
    kpiContractsSeries.push(stats.contracts);
    if (kpiValidatorsSeries.length > 16) kpiValidatorsSeries.shift();
    if (kpiContractsSeries.length > 16) kpiContractsSeries.shift();
    renderStats();
  }, 5000);

  // ---- epoch history bars ----
  const historyBarsEl = document.getElementById("dashHistoryBars");
  const uptimePctEl = document.getElementById("dashUptimePct");
  if (historyBarsEl) {
    const N = 30;
    const values = [];
    for (let i = 0; i < N; i++) {
      const r = Math.random();
      let v;
      if (r < 0.05) v = rand(55, 78);
      else if (r < 0.18) v = rand(80, 93);
      else v = rand(94, 100);
      values.push(v);
    }
    const frag = document.createDocumentFragment();
    values.forEach((v) => {
      const bar = document.createElement("div");
      bar.className = "dash-history-bar" + (v < 80 ? " is-miss" : v < 94 ? " is-low" : "");
      bar.style.height = (reduced ? v : 4) + "%";
      frag.appendChild(bar);
      if (!reduced) requestAnimationFrame(() => { bar.style.height = v + "%"; });
    });
    historyBarsEl.appendChild(frag);
    if (uptimePctEl) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      uptimePctEl.textContent = avg.toFixed(1) + "%";
    }
  }

  // ---- live TPS chart ----
  const tpsValueEl = document.getElementById("dashTpsValue");
  const tpsPeakEl = document.getElementById("dashTpsPeak");
  const tpsLineEl = document.getElementById("dashTpsLine");
  const tpsFillEl = document.getElementById("dashTpsFill");
  const TPS_POINTS = 48;
  const CHART_W = 600;
  const CHART_H = 110;
  let tpsSeries = [];
  let tpsCurrent = 640;
  let tpsPeak = 640;
  {
    let seed = tpsCurrent;
    for (let i = 0; i < TPS_POINTS; i++) {
      seed = clamp(seed + rand(-55, 60), 300, 1400);
      tpsSeries.push(seed);
    }
    tpsCurrent = tpsSeries[tpsSeries.length - 1];
    tpsPeak = Math.max.apply(null, tpsSeries);
  }
  const kpiTpsSeries = tpsSeries.slice(-16);
  let kpiTpsPrev = tpsCurrent;

  function buildPath(series) {
    const max = Math.max.apply(null, series) * 1.15;
    const min = Math.min.apply(null, series) * 0.85;
    const span = max - min || 1;
    const stepX = CHART_W / (series.length - 1);
    let line = "";
    series.forEach((v, i) => {
      const x = i * stepX;
      const y = CHART_H - ((v - min) / span) * CHART_H;
      line += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
    });
    const fill = "M0 " + CHART_H + " " + line.replace("M", "L") + "L" + CHART_W + " " + CHART_H + " Z";
    return { line: line.trim(), fill };
  }
  function renderTps() {
    const { line, fill } = buildPath(tpsSeries);
    if (tpsLineEl) tpsLineEl.setAttribute("d", line);
    if (tpsFillEl) tpsFillEl.setAttribute("d", fill);
    if (tpsValueEl) tpsValueEl.textContent = fmtInt(tpsCurrent);
    if (tpsPeakEl) tpsPeakEl.textContent = fmtInt(tpsPeak) + " " + t("dashboard.throughput.tpsUnit", "TPS");
  }
  renderTps();
  renderKpiCard("kpiTps", "dashKpiTps", kpiTpsSeries, tpsCurrent, kpiTpsPrev, fmtInt);
  setInterval(() => {
    const delta = rand(-90, 100);
    kpiTpsPrev = tpsCurrent;
    tpsCurrent = clamp(tpsCurrent + delta, 180, 2400);
    tpsSeries.push(tpsCurrent);
    if (tpsSeries.length > TPS_POINTS) tpsSeries.shift();
    kpiTpsSeries.push(tpsCurrent);
    if (kpiTpsSeries.length > 16) kpiTpsSeries.shift();
    if (tpsCurrent > tpsPeak) tpsPeak = tpsCurrent;
    renderTps();
    renderKpiCard("kpiTps", "dashKpiTps", kpiTpsSeries, tpsCurrent, kpiTpsPrev, fmtInt);
  }, 2200);

  // ---- recent blocks ----
  const blocksListEl = document.getElementById("dashBlocksList");
  let blockHeight = 1284932;
  const BLOCK_ICONS = [
    '<path d="M12 2 4 5v6c0 5.2 3.4 9.4 8 11 4.6-1.6 8-5.8 8-11V5Z"/>',
    '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>',
  ];
  function timeAgoLabel() {
    return t("dashboard.throughput.justNow", "just now");
  }
  function addBlock() {
    blockHeight += 1;
    const validator = VALIDATORS[Math.floor(Math.random() * VALIDATORS.length)];
    const txns = Math.floor(rand(4, 340));
    const row = document.createElement("div");
    row.className = "dash-block-row is-new";
    row.innerHTML =
      '<span class="dash-block-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      BLOCK_ICONS[Math.floor(Math.random() * BLOCK_ICONS.length)] +
      '</svg></span>' +
      '<span class="dash-block-mid"><span class="dash-block-num">#' + fmtInt(blockHeight) + '</span><br>' +
      '<span class="dash-block-validator">' + validator + '</span></span>' +
      '<span class="dash-block-right"><span class="dash-block-txns">' + txns + ' ' + t("dashboard.throughput.txns", "txns") + '</span><br>' +
      '<span class="dash-block-time" data-ts="' + Date.now() + '">' + timeAgoLabel() + '</span></span>';
    if (blocksListEl) {
      blocksListEl.insertBefore(row, blocksListEl.firstChild);
      while (blocksListEl.children.length > 7) {
        blocksListEl.removeChild(blocksListEl.lastChild);
      }
    }

    window.SECTORA_RECENT_BLOCKS = window.SECTORA_RECENT_BLOCKS || [];
    window.SECTORA_RECENT_BLOCKS.unshift({ height: blockHeight, txns: txns });
    if (window.SECTORA_RECENT_BLOCKS.length > 8) window.SECTORA_RECENT_BLOCKS.length = 8;
    document.dispatchEvent(new CustomEvent("sectora:block", { detail: { height: blockHeight, txns: txns } }));
  }
  for (let i = 0; i < 7; i++) addBlock();
  setInterval(addBlock, 2600);

  setInterval(() => {
    document.querySelectorAll(".dash-block-time[data-ts]").forEach((el) => {
      const secs = Math.round((Date.now() - Number(el.dataset.ts)) / 1000);
      el.textContent = secs < 2
        ? t("dashboard.throughput.justNow", "just now")
        : t("dashboard.throughput.secAgo", "{n}s ago").replace("{n}", String(secs));
    });
  }, 1000);

  // ---- metrics grid (sparkline mini-cards) ----
  const METRIC_DEFS = [
    { key: "medianFee", i18nKey: "dashboard.metrics.medianFee", label: "Median Fee", unit: "#SECT", base: 0.0042, vol: 0.0006, decimals: 4, color: "#ffffff" },
    { key: "gasPrice", i18nKey: "dashboard.metrics.gasPrice", label: "Gas Price", unit: "gwei-eq", base: 1.8, vol: 0.3, decimals: 2, color: "#ffffff" },
    { key: "highestFee", i18nKey: "dashboard.metrics.highestFee", label: "Highest Fee (24h)", unit: "#SECT", base: 0.083, vol: 0.01, decimals: 3, color: "#ffffff" },
    { key: "blockTime", i18nKey: "dashboard.metrics.blockTime", label: "Avg Block Time", unit: "sec", base: 2.1, vol: 0.15, decimals: 2, color: "#ffffff" },
    { key: "blockFullness", i18nKey: "dashboard.metrics.blockFullness", label: "Block Fullness", unit: "%", base: 46, vol: 6, decimals: 1, color: "#468ce6", max: 100 },
    { key: "largestBlock", i18nKey: "dashboard.metrics.largestBlock", label: "Largest Block (24h)", unit: "KB", base: 210, vol: 25, decimals: 0, color: "#ffffff" },
  ];
  const metricsGrid = document.getElementById("dashMetricsGrid");
  const metrics = {};

  METRIC_DEFS.forEach((def) => {
    const series = [];
    let v = def.base;
    for (let i = 0; i < 24; i++) {
      v = clamp(v + rand(-def.vol, def.vol) * 0.5, def.base * 0.5, def.max || def.base * 2.2);
      series.push(v);
    }
    metrics[def.key] = { def, series, value: v, prevValue: v };

    const gradId = "gradMetric-" + def.key;
    const lineGradId = "lineGradMetric-" + def.key;
    const card = document.createElement("div");
    card.className = "dcard metric-card";
    card.innerHTML =
      '<div class="metric-head"><span class="metric-label" id="label-' + def.key + '">' + t(def.i18nKey, def.label) + '</span><span class="metric-window" id="window-' + def.key + '">' + t("dashboard.metrics.window", "24H") + '</span></div>' +
      '<svg class="metric-spark" viewBox="0 0 200 32" preserveAspectRatio="none">' +
      '<defs>' +
      '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + def.color + '" stop-opacity="0.38"/><stop offset="55%" stop-color="' + def.color + '" stop-opacity="0.09"/><stop offset="100%" stop-color="' + def.color + '" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + lineGradId + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="' + def.color + '" stop-opacity="0.5"/><stop offset="100%" stop-color="' + def.color + '" stop-opacity="1"/></linearGradient>' +
      '</defs>' +
      '<path id="fill-' + def.key + '" class="metric-spark-fill" fill="url(#' + gradId + ')"/>' +
      '<path id="spark-' + def.key + '" class="metric-spark-line" stroke="url(#' + lineGradId + ')"/>' +
      '<circle id="dot-' + def.key + '" class="metric-spark-dot" r="2.4" fill="' + def.color + '"/>' +
      '</svg>' +
      '<div class="metric-bottom"><span class="metric-value" id="val-' + def.key + '">&mdash;</span><span class="metric-unit">' + def.unit + '</span>' +
      '<span class="metric-delta" id="delta-' + def.key + '"></span></div>';
    metricsGrid.appendChild(card);
  });

  function renderMetric(key) {
    const m = metrics[key];
    const path = document.getElementById("spark-" + key);
    const fillPath = document.getElementById("fill-" + key);
    const dotEl = document.getElementById("dot-" + key);
    const valueEl = document.getElementById("val-" + key);
    const deltaEl = document.getElementById("delta-" + key);
    const { line, fill, dotX, dotY } = buildSparkDot(m.series, 200, 32);
    if (path) path.setAttribute("d", line);
    if (fillPath) fillPath.setAttribute("d", fill);
    if (dotEl) { dotEl.setAttribute("cx", dotX.toFixed(1)); dotEl.setAttribute("cy", dotY.toFixed(1)); }
    if (valueEl) valueEl.textContent = m.value.toFixed(m.def.decimals);
    if (deltaEl) {
      const pct = ((m.value - m.prevValue) / (m.prevValue || 1)) * 100;
      deltaEl.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
      deltaEl.className = "metric-delta " + (pct >= 0 ? "is-up" : "is-down");
    }
  }
  Object.keys(metrics).forEach(renderMetric);
  setInterval(() => {
    Object.keys(metrics).forEach((key) => {
      const m = metrics[key];
      m.prevValue = m.value;
      const next = clamp(m.value + rand(-m.def.vol, m.def.vol), m.def.base * 0.4, m.def.max || m.def.base * 2.5);
      m.value = next;
      m.series.push(next);
      if (m.series.length > 24) m.series.shift();
      renderMetric(key);
    });
  }, 4000);

  // ---- metrics toggle: shows/hides everything below "Become a
  // Validator" (KPI row, validator panel, throughput, network
  // metrics, staking) behind a single button ----
  const metricsToggleBtn = document.getElementById("dashMetricsToggle");
  const metricsCollapse = document.getElementById("dashMetricsCollapse");
  if (metricsToggleBtn && metricsCollapse) {
    const metricsToggleLabel = metricsToggleBtn.querySelector("[data-i18n]");
    function setMetricsExpanded(nowExpanded) {
      metricsToggleBtn.setAttribute("aria-expanded", String(nowExpanded));
      metricsCollapse.hidden = !nowExpanded;
      metricsToggleBtn.classList.toggle("is-open", nowExpanded);
      if (metricsToggleLabel) {
        const key = nowExpanded ? "dashboard.metrics.hideBtn" : "dashboard.metrics.viewBtn";
        const fallback = nowExpanded ? "Hide metrics" : "View metrics";
        metricsToggleLabel.setAttribute("data-i18n", key);
        metricsToggleLabel.textContent = t(key, fallback);
      }
    }
    metricsToggleBtn.addEventListener("click", () => {
      setMetricsExpanded(metricsToggleBtn.getAttribute("aria-expanded") !== "true");
    });

    // deep links into the collapsed area (e.g. #validator-panel) should
    // expand it first, then let the browser's own anchor scroll happen
    function expandIfHashInside() {
      const id = location.hash.slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (target && metricsCollapse.contains(target)) {
        setMetricsExpanded(true);
      }
    }
    expandIfHashInside();
    window.addEventListener("hashchange", expandIfHashInside);
    document.addEventListener("click", (e) => {
      const link = e.target.closest && e.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (target && metricsCollapse.contains(target) && metricsCollapse.hidden) {
        setMetricsExpanded(true);
      }
    });
  }

  // ---- staking ----
  let staking = { total: 18400000, pending: 92000, apy: 7.4 };
  function renderStaking() {
    const total = document.getElementById("dashStakeTotal");
    const totalPct = document.getElementById("dashStakeTotalPct");
    const pending = document.getElementById("dashStakePending");
    const pendingSub = document.getElementById("dashStakePendingSub");
    const apy = document.getElementById("dashStakeApy");
    if (total) total.textContent = fmtUSD(staking.total) + " #SECT";
    if (totalPct) {
      const pct = ((staking.total / 25000000) * 100).toFixed(1);
      totalPct.textContent = t("dashboard.staking.totalPct", "{pct}% of circulating supply").replace("{pct}", pct);
    }
    if (pending) pending.textContent = fmtUSD(staking.pending) + " #SECT";
    if (pendingSub) pendingSub.textContent = t("dashboard.staking.pendingSub", "activating next epoch");
    if (apy) apy.textContent = staking.apy.toFixed(2) + "%";
  }
  renderStaking();
  setInterval(() => {
    staking.total = clamp(staking.total + rand(-4000, 9000), 15000000, 22000000);
    staking.pending = clamp(staking.pending + rand(-6000, 6000), 20000, 220000);
    staking.apy = clamp(staking.apy + rand(-0.06, 0.06), 5.5, 9.5);
    renderStaking();
  }, 6000);

  // ---- re-render text that's only painted once, on language switch ----
  document.addEventListener("sectora:langchange", () => {
    METRIC_DEFS.forEach((def) => {
      const labelEl = document.getElementById("label-" + def.key);
      const windowEl = document.getElementById("window-" + def.key);
      if (labelEl) labelEl.textContent = t(def.i18nKey, def.label);
      if (windowEl) windowEl.textContent = t("dashboard.metrics.window", "24H");
    });
    renderNodeTooltips();
  });
})();
