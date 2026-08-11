(() => {
  const els = document.querySelectorAll(".supply-stat-value[data-count]");
  if (!els.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function format(value, prefix, suffix) {
    const rounded = Math.round(value).toLocaleString("de-DE");
    return `${prefix}${rounded}${suffix}`;
  }

  function animate(el) {
    const target = parseFloat(el.dataset.target);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";

    if (reduced) {
      el.textContent = format(target, prefix, suffix);
      return;
    }

    const duration = 1400;
    const start = performance.now();

    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(target * eased, prefix, suffix);
      if (p < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  els.forEach((el) => {
    el.textContent = format(0, el.dataset.prefix || "", el.dataset.suffix || "");
  });

  if (!("IntersectionObserver" in window)) {
    els.forEach(animate);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animate(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  els.forEach((el) => observer.observe(el));
})();
