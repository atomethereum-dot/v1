(() => {
  const STORAGE_KEY = "sectora_lang";

  const LANGS = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "zh", name: "中文" },
    { code: "pt", name: "Português" },
    { code: "ru", name: "Русский" },
    { code: "fr", name: "Français" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "ar", name: "العربية" },
    { code: "de", name: "Deutsch" },
    { code: "hi", name: "हिन्दी" },
  ];
  const RTL_LANGS = new Set(["ar"]);
  const SUPPORTED = new Set(LANGS.map((l) => l.code));
  // Spanish-speaking visitors default to English unless they pick Spanish
  // themselves from the switcher — browser-language auto-detection skips it.
  const AUTO_DETECT_EXCLUDE = new Set(["es"]);

  function dict() {
    const base = window.SECTORA_I18N || {};
    const extra = window.SECTORA_I18N_EXTRA;
    if (!extra) return base;
    const merged = {};
    const langs = new Set([...Object.keys(base), ...Object.keys(extra)]);
    langs.forEach((l) => {
      merged[l] = Object.assign({}, base[l], extra[l]);
    });
    return merged;
  }

  function detectInitialLang() {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.has(stored)) return stored;
    } catch (e) {
      /* localStorage unavailable — fall through to detection */
    }
    const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
    for (const raw of candidates) {
      if (!raw) continue;
      const code = raw.toLowerCase().split("-")[0];
      if (AUTO_DETECT_EXCLUDE.has(code)) continue;
      if (SUPPORTED.has(code)) return code;
    }
    return "en";
  }

  function resolveForLang(key, lang) {
    const table = dict();
    const fromLang = table[lang] && table[lang][key];
    if (typeof fromLang === "string") return fromLang;
    const fromEn = table.en && table.en[key];
    if (typeof fromEn === "string") return fromEn;
    return key;
  }

  function t(key) {
    return resolveForLang(key, window.SECTORA_CURRENT_LANG || "en");
  }

  function applyToNode(el, lang) {
    const key = el.getAttribute("data-i18n");
    if (key) {
      // innerHTML (not textContent) so HTML entities in the dictionary
      // (&mdash;, &hellip;, etc.) render as glyphs rather than literal text.
      // Every dictionary value is our own static translated copy, never
      // user input, and is limited to <strong>/<br> plus named entities
      // (verified at build time), so this is safe.
      el.innerHTML = resolveForLang(key, lang);
    }
    const attrSpec = el.getAttribute("data-i18n-attr");
    if (attrSpec) {
      attrSpec.split(";").forEach((pair) => {
        const idx = pair.indexOf(":");
        if (idx === -1) return;
        const attrName = pair.slice(0, idx).trim();
        const attrKey = pair.slice(idx + 1).trim();
        if (!attrName || !attrKey) return;
        el.setAttribute(attrName, resolveForLang(attrKey, lang));
      });
    }
  }

  function syncSelects(lang) {
    document.querySelectorAll("select.lang-switch").forEach((sel) => {
      if (sel.value !== lang) sel.value = lang;
    });
  }

  function applyLanguage(lang, opts) {
    if (!SUPPORTED.has(lang)) lang = "en";
    window.SECTORA_CURRENT_LANG = lang;

    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", RTL_LANGS.has(lang) ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n], [data-i18n-attr]").forEach((el) => applyToNode(el, lang));

    syncSelects(lang);

    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* ignore persistence failures (private browsing, storage disabled) */
    }

    if (!opts || !opts.silent) {
      document.dispatchEvent(new CustomEvent("sectora:langchange", { detail: { lang: lang } }));
    }
  }

  function buildSelect(select) {
    if (!select || select.dataset.i18nBuilt) return;
    select.dataset.i18nBuilt = "1";
    LANGS.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.name;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => applyLanguage(select.value));
  }

  window.SECTORA_T = t;
  window.SECTORA_APPLY_LANG = applyLanguage;
  window.SECTORA_LANGS = LANGS;

  document.querySelectorAll("select.lang-switch").forEach(buildSelect);

  const initialLang = detectInitialLang();
  applyLanguage(initialLang, { silent: true });
})();
