(() => {
  const els = Array.from(document.querySelectorAll("[data-parallax]"));
  if (!els.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const items = els.map((el) => ({ el, speed: parseFloat(el.dataset.parallax) || 0.1 }));
  let ticking = false;

  function update() {
    ticking = false;
    const vh = window.innerHeight;
    const center = vh / 2;

    items.forEach(({ el, speed }) => {
      const rect = el.getBoundingClientRect();
      const elCenter = rect.top + rect.height / 2;
      const offset = (center - elCenter) * speed;
      el.style.transform = `translateY(${offset.toFixed(1)}px)`;
    });
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();
})();
