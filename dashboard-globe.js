(() => {
  "use strict";
  if (typeof THREE === "undefined") return;

  const stage = document.getElementById("dashGlobeStage");
  const canvas = document.getElementById("dashGlobeCanvas");
  if (!stage || !canvas) return;

  function t(key, fallback) {
    return window.SECTORA_T ? window.SECTORA_T(key) : fallback;
  }

  /* ----- tuning knobs ---------------------------------------------- */
  const DOT_MIN = 2.4;
  const RIM = 1.0;
  /* ----------------------------------------------------------------- */

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let saverOn = false;

  /* ================================================================= *
   * 1. Land mask texture
   * ================================================================= */
  const MW = 2048, MH = MW / 2;
  const mc = document.createElement("canvas");
  mc.width = MW; mc.height = MH;
  const mg = mc.getContext("2d", { willReadFrequently: false });

  const X = (lon) => (lon + 180) / 360 * MW;
  const Y = (lat) => (90 - lat) / 180 * MH;

  function clear() { mg.fillStyle = "#000"; mg.fillRect(0, 0, MW, MH); }

  function unwrap(ring) {
    const out = [[ring[0][0], ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
      let lon = ring[i][0];
      const prev = out[i - 1][0];
      while (lon - prev > 180) lon -= 360;
      while (prev - lon > 180) lon += 360;
      out.push([lon, ring[i][1]]);
    }
    return out;
  }

  function tracePolys(polys) {
    mg.fillStyle = "#fff";
    for (const poly of polys) {
      const rings = poly.map(unwrap);
      let lo = Infinity, hi = -Infinity;
      for (const r of rings) for (const p of r) { if (p[0] < lo) lo = p[0]; if (p[0] > hi) hi = p[0]; }

      const offsets = [0];
      if (hi > 180) offsets.push(-360);
      if (lo < -180) offsets.push(360);

      for (const off of offsets) {
        mg.beginPath();
        for (const r of rings) {
          for (let i = 0; i < r.length; i++) {
            const x = X(r[i][0] + off), y = Y(r[i][1]);
            i ? mg.lineTo(x, y) : mg.moveTo(x, y);
          }
          mg.closePath();
        }
        mg.fill("nonzero");
      }
    }
  }
  function paintFallback() {
    clear();
    tracePolys(window.SECTORA_GLOBE_LAND.land.map((r) => [r]));
    mg.fillStyle = "#000";
    for (const ring of window.SECTORA_GLOBE_LAND.water) {
      mg.beginPath();
      ring.forEach((p, i) => { const x = X(p[0]), y = Y(p[1]); i ? mg.lineTo(x, y) : mg.moveTo(x, y); });
      mg.closePath(); mg.fill();
    }
    fillSouthPoleCap();
  }
  /* Public land datasets routinely leave the last few degrees around the
     south pole uncovered (no coastline data that far in) -- on a sphere that
     gap renders as a small black disc punched into Antarctica. Close it. */
  function fillSouthPoleCap() {
    const capRow = Math.round(MH * (90 - -84) / 180);
    mg.fillStyle = "#fff";
    mg.fillRect(0, capRow, MW, MH - capRow);
  }
  paintFallback();

  const mask = new THREE.CanvasTexture(mc);
  mask.wrapS = THREE.RepeatWrapping;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.magFilter = THREE.LinearFilter;

  function decodeTopology(topo) {
    const [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
    const arcs = topo.arcs.map((arc) => {
      let x = 0, y = 0;
      return arc.map((d) => { x += d[0]; y += d[1]; return [x * sx + tx, y * sy + ty]; });
    });
    const ring = (idx) => {
      const out = [];
      for (const i of idx) {
        const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
        for (let k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]);
      }
      return out;
    };
    const geom = topo.objects.land;
    const src = geom.type === "GeometryCollection" ? geom.geometries : [geom];
    const polys = [];
    for (const g of src) {
      if (g.type === "MultiPolygon") for (const p of g.arcs) polys.push(p.map(ring));
      else if (g.type === "Polygon") polys.push(g.arcs.map(ring));
    }
    return polys;
  }

  /* Real coastlines (Natural Earth 110m, bundled locally — no network
     fetch needed), swapped in over the coarse fallback silhouette. */
  if (window.SECTORA_GLOBE_TOPOLOGY) {
    try {
      const polys = decodeTopology(window.SECTORA_GLOBE_TOPOLOGY);
      if (polys.length) { clear(); tracePolys(polys); fillSouthPoleCap(); mask.needsUpdate = true; }
    } catch (e) { /* keep the fallback silhouette */ }
  }

  /* ================================================================= *
   * 2. Scene
   * ================================================================= */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  mask.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  /* On desktop the stage is now a full-viewport (100vh) section rather than a
     contained card, so the sphere needs more headroom or its top/bottom --
     including the atmosphere rim glow -- clips against the canvas edges. */
  const isDesktopStage = matchMedia("(min-width: 641px)").matches;
  const HOME = { dist: isDesktopStage ? 4.3 : 3.85, rx: 0.6, ry: -Math.PI / 2 - (22 * Math.PI) / 180 };
  let dist = HOME.dist;

  const globe = new THREE.Group();
  globe.rotation.set(HOME.rx, HOME.ry, 0);
  scene.add(globe);

  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(1, 160, 120),
    new THREE.ShaderMaterial({
      uniforms: { uMask: { value: mask }, uRim: { value: RIM } },
      vertexShader: `
        varying vec2 vUv; varying vec3 vN; varying vec3 vNv;
        void main(){
          vUv = uv;
          vN  = normalize(mat3(modelMatrix) * normal);
          vNv = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMask; uniform float uRim;
        varying vec2 vUv; varying vec3 vN; varying vec3 vNv;
        void main(){
          float land = texture2D(uMask, vUv).r;
          vec3 base = mix(vec3(0.255,0.259,0.271), vec3(0.043,0.043,0.051), land);

          vec3  L   = normalize(vec3(-0.35, 0.75, 0.55));
          float lam = clamp(dot(vN, L) * 0.5 + 0.5, 0.0, 1.0);
          base *= 0.30 + 0.95 * pow(lam, 1.35);

          float edge = 1.0 - abs(vNv.z);
          base += vec3(1.0) * pow(edge, 13.0) * 0.78 * uRim * (0.5 + 0.5 * lam);
          base += vec3(1.0) * pow(edge,  4.0) * 0.05 * uRim * lam;

          gl_FragColor = vec4(base, 1.0);
        }`
    })
  );
  globe.add(surface);

  globe.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.075, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uRim: { value: RIM } },
      vertexShader: `
        varying vec3 vNv; varying vec3 vN;
        void main(){
          vNv = normalize(normalMatrix * normal);
          vN  = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uRim;
        varying vec3 vNv; varying vec3 vN;
        void main(){
          float f = pow(1.0 - abs(vNv.z), 5.0);
          float lam = clamp(dot(vN, normalize(vec3(-0.35,0.75,0.55))) * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(vec3(0.9,0.93,0.98), f * 0.27 * uRim * (0.45 + 0.55 * lam));
        }`
    })
  ));

  /* ================================================================= *
   * 3. Nodes
   * ================================================================= */
  const D = Math.PI / 180;
  function toXYZ(lon, lat, r) {
    const th = (90 - lat) * D, p = (lon + 180) * D;
    return new THREE.Vector3(-r * Math.cos(p) * Math.sin(th), r * Math.cos(th), r * Math.sin(p) * Math.sin(th));
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

  const CLUSTERS = [
    [-0.1, 51.5, 26, 2.6], [2.3, 48.9, 20, 2.4], [8.4, 50.1, 34, 3.4], [4.9, 52.4, 16, 1.8], [6.1, 46.5, 10, 1.6],
    [12.5, 41.9, 18, 3.2], [-3.7, 40.4, 14, 3.0], [-8.6, 40.2, 6, 1.6], [18.6, 50.1, 24, 3.4], [24.1, 56.2, 16, 3.4],
    [30.5, 50.4, 18, 3.6], [37.6, 55.7, 20, 3.4], [12.6, 56.2, 14, 3.2], [17.6, 63.5, 8, 4.0], [25.5, 62.3, 9, 3.4],
    [77.6, 12.9, 40, 3.6], [72.9, 19.1, 28, 2.2], [77.2, 28.6, 32, 2.6], [88.4, 22.6, 14, 2.2], [90.4, 23.8, 15, 2.0],
    [100.5, 13.7, 9, 2.6], [106.8, -6.2, 13, 2.8], [121.5, 31.2, 15, 3.4], [116.4, 39.9, 13, 3.2], [139.7, 35.7, 11, 2.6],
    [-74.0, 40.7, 22, 3.0], [-87.6, 41.9, 12, 3.2], [-122.4, 37.8, 16, 2.4], [-118.2, 34.1, 12, 2.6], [-80.2, 26.0, 9, 2.6],
    [-46.6, -23.5, 11, 3.2], [-58.4, -34.6, 7, 2.8], [151.2, -33.9, 9, 2.6], [144.9, -37.8, 6, 2.2], [55.3, 25.2, 12, 2.6],
    [30.3, 59.9, 10, 2.4], [13.4, 52.5, 18, 2.0], [9.2, 45.5, 10, 1.8], [-99.1, 19.4, 9, 2.6], [28.0, -26.2, 7, 2.6]
  ];

  const nodes = [];
  for (const [lon, lat, n, s] of CLUSTERS)
    for (let i = 0; i < n; i++)
      nodes.push({ lon: lon + gauss() * s * 1.6, lat: lat + gauss() * s, size: DOT_MIN + Math.pow(Math.random(), 3.0) * 2.6 });
  for (let i = 0; i < 40; i++)
    nodes.push({ lon: -180 + Math.random() * 360, lat: -55 + Math.random() * 120, size: DOT_MIN + Math.random() * 0.6 });
  for (let i = 0; i < 4; i++) nodes[(Math.random() * nodes.length) | 0].size = 6.2;

  const posArr = new Float32Array(nodes.length * 3), szArr = new Float32Array(nodes.length);
  nodes.forEach((nd, i) => {
    const v = toXYZ(nd.lon, nd.lat, 1.004); nd.v = v;
    posArr[i * 3] = v.x; posArr[i * 3 + 1] = v.y; posArr[i * 3 + 2] = v.z;
    szArr[i] = nd.size;
  });
  const nodeGeo = new THREE.BufferGeometry();
  nodeGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
  nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(szArr, 1));

  const nodeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uDpr: { value: 1 } },
    vertexShader: `
      attribute float aSize; uniform float uDpr;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uDpr * (2.9 / -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float core = smoothstep(0.40, 0.12, d);
        float halo = smoothstep(0.50, 0.10, d) * 0.18;
        vec3 c = mix(vec3(0.16,0.42,0.78), vec3(0.55,0.78,1.0), core * 0.6);
        gl_FragColor = vec4(c, min(1.0, core * 0.88 + halo));
      }`
  });
  globe.add(new THREE.Points(nodeGeo, nodeMat));

  /* ================================================================= *
   * 4. Pulses + arcs
   * ================================================================= */
  const ringTex = (() => {
    const s = 128, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.5);
    grd.addColorStop(0, "rgba(70,140,230,0)");
    grd.addColorStop(0.55, "rgba(120,180,245,0.55)");
    grd.addColorStop(1, "rgba(70,140,230,0)");
    g.fillStyle = grd; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 6.284); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const pulses = [], arcs = [];
  function pulse(v) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8
    }));
    sp.position.copy(v).multiplyScalar(1.002);
    sp.scale.setScalar(0.015);
    globe.add(sp); pulses.push({ sp, t: 0 });
  }
  function arc(a, b) {
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(1 + a.distanceTo(b) * 0.26);
    const pts = new THREE.QuadraticBezierCurve3(a.clone().multiplyScalar(1.004), mid, b.clone().multiplyScalar(1.004)).getPoints(96);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.setDrawRange(0, 2);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9bc2ea, transparent: true, opacity: 0, depthWrite: false }));
    globe.add(line); arcs.push({ line, t: 0, n: pts.length });
  }

  function emitPulse() {
    if (saverOn) return;
    const a = nodes[(Math.random() * nodes.length) | 0];
    pulse(a.v);
    if (arcs.length < 2 && Math.random() < 0.4) {
      const b = nodes[(Math.random() * nodes.length) | 0];
      if (a.v.distanceTo(b.v) > 0.6) arc(a.v, b.v);
    }
  }
  emitPulse(); emitPulse();
  const pulseTimer = setInterval(emitPulse, 2400);

  /* ================================================================= *
   * 5. Interaction (scoped to this card, not the whole page)
   * ================================================================= */
  let rx = HOME.rx, ry = HOME.ry, vx = 0, vy = 0, dragging = false, px = 0, py = 0, spun = false, selected = false;
  const hint = document.getElementById("dashGlobeHint");
  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", (e) => {
    selected = true;
    canvas.setPointerCapture(e.pointerId); dragging = true; px = e.clientX; py = e.clientY; vx = vy = 0;
    canvas.style.cursor = "grabbing";
  });
  document.addEventListener("pointerdown", (e) => {
    if (!stage.contains(e.target)) selected = false;
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    vy = ((e.clientX - px) / w) * 3.2;
    vx = ((e.clientY - py) / h) * 2.6;
    px = e.clientX; py = e.clientY;
    if (!spun && hint) { spun = true; hint.classList.add("is-gone"); }
  });
  const up = () => { dragging = false; canvas.style.cursor = "grab"; };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => {
    if (!selected) return;
    e.preventDefault();
    dist = Math.min(8, Math.max(2.15, dist + e.deltaY * 0.0022));
  }, { passive: false });

  let pinch = 0;
  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) dist = Math.min(8, Math.max(2.15, dist * (pinch / d)));
    pinch = d;
  }, { passive: true });
  canvas.addEventListener("touchend", () => { pinch = 0; });

  const saverEl = document.getElementById("dashGlobeSaver");
  if (saverEl) {
    saverEl.addEventListener("change", () => {
      saverOn = saverEl.checked;
      renderer.setPixelRatio(saverOn ? 1 : Math.min(devicePixelRatio, 2));
      nodeMat.uniforms.uDpr.value = renderer.getPixelRatio();
      if (saverOn) {
        arcs.forEach((a) => globe.remove(a.line)); arcs.length = 0;
        pulses.forEach((p) => globe.remove(p.sp)); pulses.length = 0;
      }
    });
  }

  let homing = 0;
  const rcBtn = document.getElementById("dashGlobeRecenter");
  if (rcBtn) {
    rcBtn.addEventListener("click", () => {
      homing = 1; rcBtn.classList.add("is-spin");
      setTimeout(() => rcBtn.classList.remove("is-spin"), 420);
    });
  }

  /* ================================================================= *
   * 5b. Block feed (same live blocks as the Recent Blocks card)
   * ================================================================= */
  const feedEl = document.getElementById("dashGlobeFeed");
  if (feedEl) {
    function pushFeedBlock(block) {
      const el = document.createElement("div");
      el.className = "dgl-block"; el.dataset.rank = "0";
      el.innerHTML =
        '<div class="dgl-block-id">' + t("dashboard.globe.blockPrefix", "Block") + " #" + block.height + '</div>' +
        '<div class="dgl-block-tx">' + block.txns + " " + t("dashboard.throughput.txns", "txns") + '</div>';
      feedEl.prepend(el);
      [...feedEl.children].forEach((c, i) => {
        c.dataset.rank = String(i);
        if (i > 3) c.remove();
      });
    }
    (window.SECTORA_RECENT_BLOCKS || []).slice(0, 4).reverse().forEach(pushFeedBlock);
    document.addEventListener("sectora:block", (e) => pushFeedBlock(e.detail));
  }

  /* ================================================================= *
   * 6. Resize + loop
   * ================================================================= */
  function resize() {
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(saverOn ? 1 : Math.min(devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    nodeMat.uniforms.uDpr.value = renderer.getPixelRatio();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(resize).observe(stage);
  } else {
    window.addEventListener("resize", resize);
  }

  let running = true;
  const io = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => { running = entries[0].isIntersecting; }, { threshold: 0.05 })
    : null;
  if (io) io.observe(stage);

  let last = performance.now();
  (function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (running) {
      if (homing) {
        const k = 1 - Math.pow(0.001, dt);
        rx += (HOME.rx - rx) * k; ry += (HOME.ry - ry) * k; dist += (HOME.dist - dist) * k;
        if (Math.abs(rx - HOME.rx) < 0.002 && Math.abs(dist - HOME.dist) < 0.004) homing = 0;
      } else {
        ry += vy; rx += vx;
        if (!dragging) {
          vy *= 0.94; vx *= 0.94;
          if (!saverOn && !reduceMotion && Math.abs(vy) < 0.0006) ry -= dt * 0.028;
        }
      }
      rx = Math.max(-1.25, Math.min(1.25, rx));
      globe.rotation.y = ry; globe.rotation.x = rx;
      camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);

      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += dt;
        const k = p.t / 1.7;
        p.sp.scale.setScalar(0.015 + k * 0.26);
        p.sp.material.opacity = Math.max(0, 0.8 * (1 - k));
        if (k >= 1) { globe.remove(p.sp); p.sp.material.dispose(); pulses.splice(i, 1); }
      }
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i]; a.t += dt;
        a.line.geometry.setDrawRange(0, Math.max(2, Math.floor(Math.min(1, a.t / 2.2) * a.n)));
        a.line.material.opacity = a.t < 1 ? a.t * 0.3 : Math.max(0, 0.3 - (a.t - 3.2) * 0.26);
        if (a.t > 4.6) { globe.remove(a.line); a.line.geometry.dispose(); a.line.material.dispose(); arcs.splice(i, 1); }
      }

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  })(performance.now());
})();
