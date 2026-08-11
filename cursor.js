(() => {
  const glow = document.getElementById("cursorLight");
  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  const label = document.getElementById("cursorLabel");
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let visible = false;
  let ringX = window.innerWidth / 2, ringY = window.innerHeight / 2;
  let targetX = ringX, targetY = ringY;
  let rafId = null;

  function show() {
    if (visible) return;
    visible = true;
    if (glow) glow.style.opacity = "1";
    if (dot) dot.style.opacity = "1";
    if (ring) ring.style.opacity = "1";
  }

  function hide() {
    visible = false;
    if (glow) glow.style.opacity = "0";
    if (dot) dot.style.opacity = "0";
    if (ring) ring.style.opacity = "0";
  }

  function tick() {
    rafId = null;
    ringX += (targetX - ringX) * 0.18;
    ringY += (targetY - ringY) * 0.18;
    if (ring) ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;
    if (Math.abs(targetX - ringX) > 0.1 || Math.abs(targetY - ringY) > 0.1) {
      rafId = requestAnimationFrame(tick);
    }
  }

  window.addEventListener("pointermove", (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (glow) glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    if (dot) dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    show();
    if (rafId === null) rafId = requestAnimationFrame(tick);
  });

  document.addEventListener("mouseleave", hide);

  if (ring) {
    const interactive = "a, button, input, textarea, select, .btn, [role='button']";
    const labeled = "[data-cursor-label]";
    document.addEventListener("mouseover", (e) => {
      if (!e.target.closest) return;
      const labelTarget = e.target.closest(labeled);
      if (labelTarget) {
        ring.classList.add("cursor-ring--label");
        if (label) label.textContent = labelTarget.dataset.cursorLabel;
      } else if (e.target.closest(interactive)) {
        ring.classList.add("cursor-ring--hover");
      }
    });
    document.addEventListener("mouseout", (e) => {
      if (!e.target.closest) return;
      if (e.target.closest(labeled)) {
        ring.classList.remove("cursor-ring--label");
        if (label) label.textContent = "";
      } else if (e.target.closest(interactive)) {
        ring.classList.remove("cursor-ring--hover");
      }
    });
  }
})();
