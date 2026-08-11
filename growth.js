(() => {
  const bars = document.getElementById("growthBars");
  if (!bars) return;

  const statEl = document.querySelector(".growth-stat-value[data-count]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function runBars() {
    const fills = bars.querySelectorAll(".growth-fill");
    fills.forEach((fill, i) => {
      const pct = fill.dataset.pct;
      if (reduced) {
        fill.style.width = pct + "%";
        return;
      }
      fill.style.transitionDelay = i * 90 + "ms";
      requestAnimationFrame(() => {
        fill.style.width = pct + "%";
      });
    });
  }

  function runStat() {
    if (!statEl) return;
    const target = parseFloat(statEl.dataset.target);
    const prefix = statEl.dataset.prefix || "";
    const suffix = statEl.dataset.suffix || "";

    if (reduced) {
      statEl.textContent = prefix + target.toFixed(1) + suffix;
      return;
    }

    const duration = 1400;
    const start = performance.now();

    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      statEl.textContent = prefix + (target * eased).toFixed(1) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  if (!("IntersectionObserver" in window)) {
    runBars();
    runStat();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runBars();
          runStat();
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  observer.observe(bars);
})();
