(() => {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const els = document.querySelectorAll(".magnetic");
  const STRENGTH = 0.35;

  els.forEach((el) => {
    let rafId = null;

    function onMove(e) {
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - (rect.left + rect.width / 2);
      const relY = e.clientY - (rect.top + rect.height / 2);

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        el.style.transform = `translate(${relX * STRENGTH}px, ${relY * STRENGTH}px)`;
      });
    }

    function onLeave() {
      if (rafId) cancelAnimationFrame(rafId);
      el.style.transform = "translate(0, 0)";
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
  });
})();
