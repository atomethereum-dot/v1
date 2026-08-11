/* ---- Scrollytelling controller for the merged Network / Protocol / DEX
   band: the visual stays pinned while scrolling through it, and the
   badge/heading/status/bar-color morph between the three stages. ---- */
(() => {
  const story = document.getElementById("exec-story");
  if (!story) return;
  const sticky = story.querySelector(".exec-story-sticky");
  const contentEl = story.querySelector(".exec-content");
  const badgeEl = story.querySelector(".exec-story-badge");
  const headingEl = story.querySelector(".exec-story-heading");
  const statusEl = story.querySelector(".exec-story-status");
  const linkEl = story.querySelector(".exec-story-link");
  const barsEls = Array.from(story.querySelectorAll(".exec-bars[data-stage]"));
  const dotEls = Array.from(story.querySelectorAll(".exec-story-dot"));
  if (!sticky || !contentEl || !badgeEl || !headingEl || !statusEl || !linkEl) return;

  function t(key, fallback) {
    return window.SECTORA_T ? window.SECTORA_T(key) : fallback;
  }

  const STAGES = [
    {
      badge: "SECTORA NETWORK",
      headingKey: "execNetwork.heading",
      headingFallback: "Layer 3<br>Blockchain<br>Network",
      statusKey: "exec.status",
      statusFallback: "Live on Testnet",
      linkText: "Click here",
      advance: true,
    },
    {
      badgeKey: "exec.badge",
      badgeFallback: "SECTORA PROTOCOL",
      headingKey: "exec.heading",
      headingFallback: "Built for<br>Verification.",
      statusKey: "exec.status",
      statusFallback: "Live on Testnet",
      linkText: "Click here",
      href: "/dash",
    },
    {
      badge: "SECTORA DEX",
      headingKey: "dexCover.title",
      headingFallback: "Sectora<br>Exchange DEX",
      statusKey: "dexCover.simNote",
      statusFallback: "Preview DEX &middot; Live Market Data",
      linkKey: "dexCover.cta",
      linkFallback: "Enter the DEX",
      href: "dex-cover.html",
    },
  ];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let currentStage = -1;
  let fadeTimer = null;

  function applyStage(index) {
    const cfg = STAGES[index];
    badgeEl.textContent = cfg.badge || t(cfg.badgeKey, cfg.badgeFallback);
    headingEl.innerHTML = t(cfg.headingKey, cfg.headingFallback);
    statusEl.innerHTML = t(cfg.statusKey, cfg.statusFallback);
    linkEl.innerHTML = cfg.linkKey ? t(cfg.linkKey, cfg.linkFallback) : cfg.linkText;
    if (cfg.href) {
      linkEl.href = cfg.href;
      delete linkEl.dataset.advance;
    } else {
      linkEl.href = "#exec-story";
      linkEl.dataset.advance = "1";
    }
    barsEls.forEach((el) => {
      el.classList.toggle("is-active", Number(el.dataset.stage) === index);
    });
    dotEls.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
    });
  }

  function setStage(index, animate) {
    if (index === currentStage) return;
    currentStage = index;
    if (!animate || reduced) {
      applyStage(index);
      return;
    }
    contentEl.classList.add("exec-story-fading");
    if (fadeTimer) window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(() => {
      applyStage(index);
      contentEl.classList.remove("exec-story-fading");
    }, 220);
  }

  function stickyTopOffset() {
    const root = getComputedStyle(document.documentElement);
    const announce = parseFloat(root.getPropertyValue("--announce-h")) || 0;
    const nav = parseFloat(root.getPropertyValue("--nav-h")) || 0;
    return announce + nav;
  }

  function onScroll() {
    const rect = story.getBoundingClientRect();
    const stageH = sticky.offsetHeight;
    const scrollRange = story.offsetHeight - stageH;
    if (scrollRange <= 0) return;
    const progressPx = stickyTopOffset() - rect.top;
    const p = Math.min(1, Math.max(0, progressPx / scrollRange));
    let stage = Math.floor(p * STAGES.length);
    if (stage >= STAGES.length) stage = STAGES.length - 1;
    if (stage < 0) stage = 0;
    setStage(stage, true);
  }

  let ticking = false;
  function requestTick() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScroll();
    });
  }

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);

  linkEl.addEventListener("click", (e) => {
    if (linkEl.dataset.advance) {
      e.preventDefault();
      const stageH = sticky.offsetHeight;
      window.scrollBy({ top: stageH, behavior: reduced ? "auto" : "smooth" });
    }
  });

  document.addEventListener("sectora:langchange", () => {
    if (currentStage >= 0) applyStage(currentStage);
  });

  setStage(0, false);
  onScroll();
})();
