(() => {
  const els = document.querySelectorAll("[data-scramble]");
  if (!els.length) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  const CHARS = "!<>-_\\/[]{}=+*^?#$%&@~";

  function frameHTML(el, text, revealCount) {
    let html = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === " ") {
        html += " ";
      } else if (i < revealCount) {
        html += `<span class="scramble-done">${ch}</span>`;
      } else {
        const rand = CHARS[(Math.random() * CHARS.length) | 0];
        html += `<span class="scramble-live">${rand}</span>`;
      }
    }
    el.innerHTML = html;
  }

  function runOn(el, text) {
    const len = text.length;
    let frame = 0;
    const stepFrames = 2;
    const timer = setInterval(() => {
      const revealCount = Math.min(len, Math.floor(frame / stepFrames));
      frameHTML(el, text, revealCount);
      frame++;
      if (revealCount >= len) {
        clearInterval(timer);
        el.textContent = text;
      }
    }, 28);
  }

  els.forEach((el) => {
    const text = el.textContent;
    const delay = el.dataset.scrambleDelay;

    if (delay) {
      setTimeout(() => runOn(el, text), parseInt(delay, 10));
      return;
    }

    if (!("IntersectionObserver" in window)) {
      runOn(el, text);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runOn(el, text);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
  });
})();
