(() => {
  const banner = document.getElementById("cookieBanner");
  if (!banner) return;

  const STORAGE_KEY = "sectora_cookie_consent";

  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    stored = null;
  }

  if (stored) return;

  function show() {
    banner.classList.add("is-visible");
  }

  function hide(choice) {
    banner.classList.remove("is-visible");
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (e) {
      /* ignore storage errors */
    }
  }

  const acceptBtn = document.getElementById("cookieAccept");
  const rejectBtn = document.getElementById("cookieReject");

  if (acceptBtn) acceptBtn.addEventListener("click", () => hide("accepted"));
  if (rejectBtn) rejectBtn.addEventListener("click", () => hide("rejected"));

  setTimeout(show, 900);
})();
