// Theme boot + toggle (ui-shell spec: "Dark theme follows system preference
// with manual override").
//
// This file is loaded SYNCHRONOUSLY from <head>, before the stylesheets and
// before first paint — the CSP (`script-src 'self'`) forbids an inline boot
// script, so the pre-paint work lives in this tiny external file. It resolves
// the stored choice > OS preference > light and stamps BOTH data-theme (our
// token blocks) and data-bs-theme (Bootstrap 5.3 dark form controls) on
// <html>, so there is no flash of the wrong theme on load.
//
// Classic script — attaches to window.Scribe (safe as the first Scribe file).

(function (S) {
  "use strict";

  var KEY = "scribe.theme";

  // "light" | "dark" | null — storage failures (private mode etc.) degrade
  // to the media query.
  function readStoredTheme(storage) {
    try {
      var v = storage ? storage.getItem(KEY) : null;
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  // stored choice wins; otherwise follow the OS; otherwise light.
  function resolveTheme(storage, media) {
    var stored = readStoredTheme(storage);
    if (stored) return stored;
    if (media && typeof media.matches === "boolean" && media.matches) return "dark";
    return "light";
  }

  function applyTheme(docEl, theme) {
    docEl.setAttribute("data-theme", theme);
    // Bootstrap 5.3 native dark mode (form controls, dropdowns, alerts).
    docEl.setAttribute("data-bs-theme", theme);
  }

  function persistTheme(storage, theme) {
    try {
      storage.setItem(KEY, theme);
    } catch (e) { /* storage unavailable — theme still applies for this page */ }
  }

  // Nav toggle: flips the APPLIED theme (whatever resolved it) and persists
  // the explicit choice, which then wins over the OS preference on reload.
  function initThemeToggle(button, docEl, storage) {
    if (!button) return;
    docEl = docEl || document.documentElement;
    storage = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    button.addEventListener("click", function () {
      var current = docEl.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      applyTheme(docEl, next);
      persistTheme(storage, next);
    });
  }

  // ---- Boot (runs now, pre-paint) ----
  applyTheme(
    document.documentElement,
    resolveTheme(typeof localStorage !== "undefined" ? localStorage : null, typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null)
  );

  S.theme = {
    KEY: KEY,
    readStoredTheme: readStoredTheme,
    resolveTheme: resolveTheme,
    applyTheme: applyTheme,
    initThemeToggle: initThemeToggle
  };
})(window.Scribe || (window.Scribe = {}));
