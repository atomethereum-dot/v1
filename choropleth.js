(() => {
  const wrap = document.querySelector(".choro-map-wrap");
  const viewport = document.getElementById("choroViewport");
  const svg = document.querySelector(".choro-svg");
  const zoomInBtn = document.getElementById("choroZoomIn");
  const zoomOutBtn = document.getElementById("choroZoomOut");
  const slider = document.getElementById("choroSlider");
  const legendDot = document.getElementById("choroLegendDot");
  const legendName = document.getElementById("choroLegendName");
  if (!viewport || !svg || !wrap || typeof CHORO_RANKED === "undefined") return;

  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3.2;
  const ZOOM_STEP = 0.4;

  const vb = svg.viewBox.baseVal;
  let renderedW = 0;
  let renderedH = 0;
  let maxPanX = 0;
  let maxPanY = 0;

  // The map is rendered at "cover" size for the frame (like CSS
  // background-size: cover), so it always fills the frame with no gaps.
  // Whenever the frame's aspect ratio doesn't match the map's own, part
  // of the map extends beyond the frame even before any user zoom — that
  // part is reachable by dragging, not just after pressing +.
  function layout() {
    const rect = wrap.getBoundingClientRect();
    const coverScale = Math.max(rect.width / vb.width, rect.height / vb.height);
    renderedW = vb.width * coverScale;
    renderedH = vb.height * coverScale;
    svg.style.width = `${renderedW}px`;
    svg.style.height = `${renderedH}px`;
    clampPan();
    applyTransform();
  }

  function clampPan() {
    const rect = wrap.getBoundingClientRect();
    maxPanX = Math.max(0, (renderedW * zoom - rect.width) / 2);
    maxPanY = Math.max(0, (renderedH * zoom - rect.height) / 2);
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
  }

  function applyTransform() {
    viewport.style.transform =
      `translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px)) scale(${zoom})`;
    viewport.classList.toggle("is-pannable", maxPanX > 0 || maxPanY > 0);
  }

  function setZoom(next) {
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
    if (zoom === ZOOM_MIN) {
      panX = 0;
      panY = 0;
    }
    clampPan();
    applyTransform();
  }

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => setZoom(zoom + ZOOM_STEP));
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => setZoom(zoom - ZOOM_STEP));
  }

  // Drag-to-pan (mouse + touch via Pointer Events), available whenever
  // the rendered map is bigger than the frame — which is true by
  // default on most screens, not only once zoomed in.
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;

  viewport.addEventListener("pointerdown", (e) => {
    if (maxPanX === 0 && maxPanY === 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("is-dragging");
  });

  viewport.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    panX = startPanX + (e.clientX - startX);
    panY = startPanY + (e.clientY - startY);
    clampPan();
    applyTransform();
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    viewport.classList.remove("is-dragging");
    if (e.pointerId !== undefined && viewport.hasPointerCapture(e.pointerId)) {
      viewport.releasePointerCapture(e.pointerId);
    }
  }
  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  window.addEventListener("resize", layout);
  layout();

  const countryPaths = document.querySelectorAll(".choro-country");
  const byName = new Map();
  countryPaths.forEach((el) => {
    byName.set(el.dataset.name, el);
  });

  let activeEl = null;

  function highlight(index) {
    const entry = CHORO_RANKED[index];
    if (!entry) return;
    const [name, value, color] = entry;

    if (activeEl) activeEl.classList.remove("is-active");
    const el = byName.get(name);
    if (el) {
      el.classList.add("is-active");
      activeEl = el;
    }

    if (legendDot) legendDot.style.background = color;
    if (legendName) legendName.textContent = name;
  }

  if (slider) {
    slider.max = String(CHORO_RANKED.length - 1);
    slider.addEventListener("input", () => {
      highlight(parseInt(slider.value, 10));
    });
    highlight(parseInt(slider.value, 10));
  }

  // Drive the slider from scroll position: as the section moves through
  // the viewport, sweep from "Least Nodes" to "Most Nodes" so the map
  // and slider animate together while scrolling instead of sitting still.
  const section = document.getElementById("global-nodes");
  if (section && slider) {
    let scrollTicking = false;

    function updateFromScroll() {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const total = rect.height;
      let progress = total > 0 ? (vh - rect.top) / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      const index = Math.round(progress * (CHORO_RANKED.length - 1));
      slider.value = String(index);
      highlight(index);
      scrollTicking = false;
    }

    window.addEventListener(
      "scroll",
      () => {
        if (!scrollTicking) {
          requestAnimationFrame(updateFromScroll);
          scrollTicking = true;
        }
      },
      { passive: true }
    );

    updateFromScroll();
  }
})();
