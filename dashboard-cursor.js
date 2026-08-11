(() => {
  const light = document.getElementById("dCursorLight");
  const ring = document.getElementById("dCursorRing");
  const dot = document.getElementById("dCursorDot");
  if (!ring || !dot) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let visible = false;
  let ringX = window.innerWidth / 2;
  let ringY = window.innerHeight / 2;
  let targetX = ringX;
  let targetY = ringY;
  let rafId = null;

  function show() {
    if (visible) return;
    visible = true;
    if (light) light.style.opacity = "1";
    ring.style.opacity = "1";
    dot.style.opacity = "1";
  }
  function hide() {
    visible = false;
    if (light) light.style.opacity = "0";
    ring.style.opacity = "0";
    dot.style.opacity = "0";
  }
  function tick() {
    rafId = null;
    const ease = reduced ? 1 : 0.45;
    ringX += (targetX - ringX) * ease;
    ringY += (targetY - ringY) * ease;
    ring.style.transform = "translate(" + ringX + "px, " + ringY + "px) translate(-50%, -50%)";
    if (Math.abs(targetX - ringX) > 0.1 || Math.abs(targetY - ringY) > 0.1) {
      rafId = requestAnimationFrame(tick);
    }
  }

  window.addEventListener("pointermove", (e) => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (light) light.style.transform = "translate(" + e.clientX + "px, " + e.clientY + "px)";
    dot.style.transform = "translate(" + e.clientX + "px, " + e.clientY + "px) translate(-50%, -50%)";
    show();
    if (rafId === null) rafId = requestAnimationFrame(tick);
  });
  document.addEventListener("mouseleave", hide);

  const interactiveSel = "a, button, input, select, .dash-sidebar-link, [role='button']";
  document.addEventListener("mouseover", (e) => {
    if (e.target.closest && e.target.closest(interactiveSel)) ring.classList.add("dcursor-ring--hover");
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest(interactiveSel)) ring.classList.remove("dcursor-ring--hover");
  });
})();
