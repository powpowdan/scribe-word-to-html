// Bilingual publishing strings (EN/FR) for text that Scribe's commands
// generate. French strings are grounded in the official WET/GCWeb French
// working examples (footnotes demo; in-page ToC pattern), not translations of
// convenience.
//
// The language choice governs GENERATED publishing text only — it never
// rewrites content that already exists in the document (non-retroactive), and
// the editor chrome stays English.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  const STORAGE_KEY = "scribe.language";

  const STRINGS = {
    en: {
      onThisPage: "On this page",
      footnotesSection: "Footnotes",
      // Footnote reference: <span class="wb-inv">{fnRefPrefix}</span>N
      fnRefPrefix: "Footnote ",
      // dt entry: {fnEntryPrefix}N
      fnEntryPrefix: "Footnote ",
      // Return link: <span class="wb-inv">{fnReturnPrefix}</span>N<span class="wb-inv">{fnReturnSuffix}</span>
      fnReturnPrefix: "Return to footnote ",
      fnReturnSuffix: " referrer"
    },
    fr: {
      onThisPage: "Sur cette page",
      footnotesSection: "Notes de bas de page",
      fnRefPrefix: "Note de bas de page ",
      fnEntryPrefix: "Note de bas de page ",
      // WET French return link has no suffix — the number ends the sentence.
      fnReturnPrefix: "Retour à la référence de la note de bas de page ",
      fnReturnSuffix: ""
    }
  };

  // Read the persisted language (default en; anything stored other than
  // "fr" falls back to en). `storage` injectable for tests.
  function getLanguage(storage) {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    let v = null;
    if (s) {
      try {
        v = s.getItem(STORAGE_KEY);
      } catch (e) {
        v = null;
      }
    }
    return v === "fr" ? "fr" : "en";
  }

  // Persist the language (anything other than "fr" normalizes to "en").
  function setLanguage(lang, storage) {
    const s = storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const v = lang === "fr" ? "fr" : "en";
    if (s) {
      try {
        s.setItem(STORAGE_KEY, v);
      } catch (e) {
        /* best-effort */
      }
    }
    return v;
  }

  function t(key, lang) {
    const table = STRINGS[lang] || STRINGS.en;
    return table[key];
  }

  S.i18n = { STORAGE_KEY, STRINGS, getLanguage, setLanguage, t };
})(window.Scribe || (window.Scribe = {}));
