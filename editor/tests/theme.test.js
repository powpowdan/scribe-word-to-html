import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

// Theme resolution + toggle (ui-shell spec, "Dark theme follows system
// preference with manual override"): stored choice > OS preference > light,
// applied pre-paint by theme-boot.js (sync script in <head>); the toggle
// flips the applied theme and persists the explicit choice.

const src = readFileSync("src/theme-boot.js", "utf8");

function boot({ stored, mediaDark } = {}) {
  const win = new Window();
  if (stored) win.localStorage.setItem("scribe.theme", stored);
  win.matchMedia = () => ({ matches: !!mediaDark });
  win.eval(src);
  return win;
}

describe("theme boot", () => {
  it("applies the stored choice before anything renders", () => {
    const win = boot({ stored: "dark" });
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(win.document.documentElement.getAttribute("data-bs-theme")).toBe("dark");
  });

  it("stored light wins over a dark OS preference", () => {
    const win = boot({ stored: "light", mediaDark: true });
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(boot({ mediaDark: true }).document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(boot({ mediaDark: false }).document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("ignores an invalid stored value and follows the OS preference", () => {
    const win = boot({ mediaDark: true });
    win.localStorage.setItem("scribe.theme", "banana");
    expect(S_of(win).theme.resolveTheme(win.localStorage, { matches: true })).toBe("dark");
    expect(S_of(win).theme.resolveTheme(win.localStorage, { matches: false })).toBe("light");
  });
});

describe("theme toggle", () => {
  it("flips the applied theme and persists the choice", () => {
    const win = boot({ stored: "light" });
    const docEl = win.document.documentElement;
    const btn = win.document.createElement("button");
    S_of(win).theme.initThemeToggle(btn, docEl, win.localStorage);
    btn.click();
    expect(docEl.getAttribute("data-theme")).toBe("dark");
    expect(docEl.getAttribute("data-bs-theme")).toBe("dark");
    expect(win.localStorage.getItem("scribe.theme")).toBe("dark");
    btn.click();
    expect(docEl.getAttribute("data-theme")).toBe("light");
    expect(win.localStorage.getItem("scribe.theme")).toBe("light");
  });
});

function S_of(win) {
  return win.Scribe;
}
