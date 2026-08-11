(() => {
  const timeline = document.getElementById("roadmapTimeline");
  const progress = document.getElementById("roadmapProgress");
  if (!timeline || !progress) return;

  const dots = timeline.querySelectorAll(".roadmap-dot");
  let rafId = null;

  function update() {
    rafId = null;
    const rect = timeline.getBoundingClientRect();
    const focusLine = window.innerHeight * 0.55;
    const pct = Math.min(1, Math.max(0, (focusLine - rect.top) / rect.height));
    progress.style.height = `${pct * 100}%`;

    dots.forEach((dot) => {
      const dotRect = dot.getBoundingClientRect();
      dot.classList.toggle("active", dotRect.top <= focusLine);
    });
  }

  function schedule() {
    if (rafId === null) rafId = requestAnimationFrame(update);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
})();
