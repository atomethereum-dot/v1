(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Equalizer bars colored like a candlestick chart — each bar is
  // independently green (up) or red (down), flipping at random, instead
  // of one flat color like the dashboard's version.
  const container = document.getElementById("dexCoverBars");
  if (!container) return;
  const BAR_COUNT = 150;
  const bars = [];
  let html = "";
  for (let i = 0; i < BAR_COUNT; i++) {
    html += '<div class="dcov-bar ' + (Math.random() < 0.55 ? "is-up" : "is-down") + '"></div>';
  }
  container.innerHTML = html;
  container.querySelectorAll(".dcov-bar").forEach((bar) => bars.push(bar));

  function randomHeight() {
    if (Math.random() < 0.16) return 55 + Math.random() * 40;
    return 4 + Math.random() * 34;
  }
  function tick() {
    bars.forEach((bar) => {
      if (Math.random() < 0.5) {
        bar.style.height = Math.min(96, randomHeight()) + "%";
        if (Math.random() < 0.2) {
          const up = Math.random() < 0.55;
          bar.classList.toggle("is-up", up);
          bar.classList.toggle("is-down", !up);
        }
      }
    });
  }
  tick();
  if (!reduced) setInterval(tick, 200);
})();
