(() => {
  const mesh = document.getElementById("heroMesh");
  const hero = document.querySelector(".hero");
  if (!mesh || !hero) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let raf = null;

  function tick() {
    curX += (targetX - curX) * 0.06;
    curY += (targetY - curY) * 0.06;
    mesh.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0) scale(1.04)`;
    if (Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = null;
    }
  }

  function onMove(e) {
    const rect = hero.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    targetX = px * -18;
    targetY = py * -14;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function onLeave() {
    targetX = 0;
    targetY = 0;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  hero.addEventListener("pointermove", onMove);
  hero.addEventListener("pointerleave", onLeave);
})();
