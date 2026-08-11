(() => {
  const fill = document.getElementById("wpProgressFill");
  const toc = document.getElementById("wpToc");
  const sections = Array.from(document.querySelectorAll(".wp-section"));
  const printBtn = document.getElementById("wpPrintBtn");
  const isMobile = window.matchMedia("(max-width: 960px)");

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  if (fill) {
    let ticking = false;
    function updateProgress() {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const pct = scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0;
      fill.style.width = pct + "%";
    }
    function requestTick() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateProgress);
    }
    window.addEventListener("scroll", requestTick, { passive: true });
    window.addEventListener("resize", requestTick);
    updateProgress();
  }

  if (toc && sections.length) {
    const links = Array.from(toc.querySelectorAll("a[data-toc]"));
    const linkById = {};
    links.forEach((link) => { linkById[link.dataset.toc] = link; });

    function setActive(id) {
      links.forEach((link) => link.classList.toggle("is-active", link.dataset.toc === id));
      if (isMobile.matches && linkById[id]) {
        linkById[id].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActive(entry.target.id);
            }
          });
        },
        { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
      );
      sections.forEach((section) => observer.observe(section));
    }
  }
})();
