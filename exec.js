(() => {
  const containers = document.querySelectorAll(".exec-bars");
  if (!containers.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function randomHeight() {
    if (Math.random() < 0.22) {
      return 62 + Math.random() * 34;
    }
    return 28 + Math.random() * 38;
  }

  // The 3 merged scrollytelling stages stack a full set of bars each
  // (data-stage), but only one is ever visible (.is-active) at a time.
  // Animating all 3 in parallel forever was 3x the necessary style/paint
  // work on a now full-screen section - only tick the visible layer, and
  // stop entirely once the section scrolls off screen.
  const hasStages = Array.from(containers).some((c) => c.hasAttribute("data-stage"));
  let sectionVisible = true;
  if (hasStages && "IntersectionObserver" in window) {
    const story = document.getElementById("exec-story");
    const observed = story || containers[0].closest(".exec");
    if (observed) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            sectionVisible = entry.isIntersecting;
          });
        },
        { threshold: 0 }
      );
      observer.observe(observed);
    }
  }

  containers.forEach((container) => {
    const isCandle = container.classList.contains("exec-bars--candle");
    const BAR_COUNT = isCandle ? 150 : 170;
    let html = "";
    for (let i = 0; i < BAR_COUNT; i++) {
      if (isCandle) {
        html += '<div class="exec-bar ' + (Math.random() < 0.55 ? "is-up" : "is-down") + '"></div>';
      } else {
        html += `<div class="exec-bar"></div>`;
      }
    }
    container.innerHTML = html;
    const bars = Array.from(container.querySelectorAll(".exec-bar"));

    function tick(force) {
      if (!force) {
        if (!sectionVisible) return;
        if (hasStages && !container.classList.contains("is-active")) return;
      }
      bars.forEach((bar) => {
        if (Math.random() < 0.5) {
          bar.style.height = `${Math.min(96, randomHeight())}%`;
          if (isCandle && Math.random() < 0.2) {
            const up = Math.random() < 0.55;
            bar.classList.toggle("is-up", up);
            bar.classList.toggle("is-down", !up);
          }
        }
      });
    }

    tick(true);
    if (!reduced) {
      setInterval(() => tick(false), 200);
    }
  });
})();
