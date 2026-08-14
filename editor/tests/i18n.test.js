import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Coverage for the bilingual publishing-string module: string tables for both
// languages (grounded in the official WET/GCWeb French examples), language
// persistence with an injectable storage, and the fallback behavior.

const win = loadScribe(["i18n.js"]);
const I = win.Scribe.i18n;

function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _raw: store
  };
}

describe("STRINGS tables", () => {
  const KEYS = [
    "onThisPage",
    "footnotesSection",
    "fnRefPrefix",
    "fnEntryPrefix",
    "fnReturnPrefix",
    "fnReturnSuffix"
  ];

  it("every key exists in both languages", () => {
    KEYS.forEach((k) => {
      expect(typeof I.STRINGS.en[k]).toBe("string");
      expect(typeof I.STRINGS.fr[k]).toBe("string");
    });
  });

  it("French strings match the official WET/GCWeb wording", () => {
    expect(I.STRINGS.fr.onThisPage).toBe("Sur cette page");
    expect(I.STRINGS.fr.footnotesSection).toBe("Notes de bas de page");
    expect(I.STRINGS.fr.fnRefPrefix).toBe("Note de bas de page ");
    expect(I.STRINGS.fr.fnReturnPrefix).toContain("Retour à la référence de la note de bas de page");
    expect(I.STRINGS.fr.fnReturnSuffix).toBe(""); // FR return link ends at the number
  });

  it("English strings match the official WET wording", () => {
    expect(I.STRINGS.en.onThisPage).toBe("On this page");
    expect(I.STRINGS.en.footnotesSection).toBe("Footnotes");
    expect(I.STRINGS.en.fnReturnSuffix).toBe(" referrer");
  });
});

describe("getLanguage / setLanguage", () => {
  it("defaults to en when nothing is stored", () => {
    expect(I.getLanguage(fakeStorage())).toBe("en");
  });

  it("returns fr when fr is stored", () => {
    const s = fakeStorage();
    s.setItem(I.STORAGE_KEY, "fr");
    expect(I.getLanguage(s)).toBe("fr");
  });

  it("falls back to en for invalid stored values", () => {
    const s = fakeStorage();
    s.setItem(I.STORAGE_KEY, "de");
    expect(I.getLanguage(s)).toBe("en");
    s.setItem(I.STORAGE_KEY, "garbage");
    expect(I.getLanguage(s)).toBe("en");
  });

  it("setLanguage persists and normalizes", () => {
    const s = fakeStorage();
    expect(I.setLanguage("fr", s)).toBe("fr");
    expect(s.getItem(I.STORAGE_KEY)).toBe("fr");
    expect(I.setLanguage("de", s)).toBe("en"); // anything non-fr normalizes to en
    expect(s.getItem(I.STORAGE_KEY)).toBe("en");
    expect(I.getLanguage(s)).toBe("en");
  });

  it("survives storage failures (best-effort, never throws)", () => {
    const broken = {
      getItem: () => { throw new Error("quota"); },
      setItem: () => { throw new Error("quota"); },
      removeItem: () => {}
    };
    expect(I.getLanguage(broken)).toBe("en");
    expect(() => I.setLanguage("fr", broken)).not.toThrow();
  });
});

describe("t()", () => {
  it("looks up per language; unknown language falls back to en", () => {
    expect(I.t("onThisPage", "fr")).toBe("Sur cette page");
    expect(I.t("onThisPage", "en")).toBe("On this page");
    expect(I.t("onThisPage", "xx")).toBe("On this page");
  });
});
