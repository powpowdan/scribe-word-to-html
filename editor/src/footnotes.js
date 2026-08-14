// Footnotes — manual "Insert footnote" producing WET (GCWeb) footnote markup.
// Grounded in the official WET footnotes working example: an in-body <sup>
// reference and a trailing <aside class="wb-fnote"> definition list.
//
// The markup builders are pure DOM operations (headlessly testable); the
// caret insertion uses the Selection/Range API (browser-verified).
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // Localized footnote strings (WET official); falls back to English when
  // i18n.js is not loaded.
  function fnStrings(lang) {
    if (S.i18n && S.i18n.STRINGS[lang]) return S.i18n.STRINGS[lang];
    return S.i18n ? S.i18n.STRINGS.en : {
      footnotesSection: "Footnotes",
      fnRefPrefix: "Footnote ",
      fnEntryPrefix: "Footnote ",
      fnReturnPrefix: "Return to footnote ",
      fnReturnSuffix: " referrer"
    };
  }

  // <sup id="fnN-rf"><a class="fn-lnk" href="#fnN"><span class="wb-inv">Footnote </span>N</a></sup>
  function buildFootnoteReference(n, lang) {
    const str = fnStrings(lang);
    const sup = document.createElement("sup");
    sup.id = "fn" + n + "-rf";
    const a = document.createElement("a");
    a.className = "fn-lnk";
    a.setAttribute("href", "#fn" + n);
    const inv = document.createElement("span");
    inv.className = "wb-inv";
    inv.textContent = str.fnRefPrefix;
    a.appendChild(inv);
    a.appendChild(document.createTextNode(String(n)));
    sup.appendChild(a);
    return sup;
  }

  // Fragment: <dt>Footnote N</dt> + <dd id="fnN"><p>text</p><p class="fn-rtn">…return…</p></dd>
  function buildFootnoteEntry(n, text, lang) {
    const str = fnStrings(lang);
    const frag = document.createDocumentFragment();

    const dt = document.createElement("dt");
    dt.textContent = str.fnEntryPrefix + n;
    frag.appendChild(dt);

    const dd = document.createElement("dd");
    dd.id = "fn" + n;

    const body = document.createElement("p");
    body.textContent = String(text == null ? "" : text);
    dd.appendChild(body);

    const rtn = document.createElement("p");
    rtn.className = "fn-rtn";
    const a = document.createElement("a");
    a.setAttribute("href", "#fn" + n + "-rf");
    const inv1 = document.createElement("span");
    inv1.className = "wb-inv";
    inv1.textContent = str.fnReturnPrefix;
    a.appendChild(inv1);
    a.appendChild(document.createTextNode(String(n)));
    // WET French omits the trailing suffix segment; English adds " referrer".
    if (str.fnReturnSuffix) {
      const inv2 = document.createElement("span");
      inv2.className = "wb-inv";
      inv2.textContent = str.fnReturnSuffix;
      a.appendChild(inv2);
    }
    rtn.appendChild(a);
    dd.appendChild(rtn);

    frag.appendChild(dd);
    return frag;
  }

  // Next footnote number = max existing fn<digit> dd id + 1 (symbolic fn* skipped).
  function nextFootnoteNumber(root) {
    let max = 0;
    root.querySelectorAll('dd[id^="fn"]').forEach((dd) => {
      const m = /^fn(\d+)$/.exec(dd.id);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    });
    return max + 1;
  }

  // Find or create <aside class="wb-fnote"><h2 id="fn">Footnotes</h2><dl/></aside>;
  // return the <dl>. The section heading follows the selected language.
  function ensureFootnotesAside(root, lang) {
    const str = fnStrings(lang);
    let aside = root.querySelector("aside.wb-fnote");
    if (!aside) {
      aside = document.createElement("aside");
      aside.className = "wb-fnote";
      aside.setAttribute("role", "note");
      const h2 = document.createElement("h2");
      h2.id = "fn";
      h2.textContent = str.footnotesSection;
      aside.appendChild(h2);
      const dl = document.createElement("dl");
      aside.appendChild(dl);
      root.appendChild(aside);
    } else {
      // Refresh the section heading if the language changed since creation.
      const h2 = aside.querySelector("h2#fn");
      if (h2) h2.textContent = str.footnotesSection;
    }
    return aside.querySelector("dl");
  }

  // config: { liveRoot, button, onChange, onInserted(n), onError(msg) }
  function mountFootnotes(config) {
    config = config || {};
    const liveRoot = config.liveRoot;
    const button = config.button;
    const onChange = config.onChange || function () {};
    if (!button) return;

    // Keep the caret in the Live view when the button is clicked.
    button.addEventListener("mousedown", (e) => e.preventDefault());
    button.addEventListener("click", () => {
      const text = window.prompt("Footnote text:", "");
      if (text === null) return; // cancelled
      if (!text.trim()) {
        if (config.onError) config.onError("Footnote text is empty.");
        return;
      }

      const sel = window.getSelection && window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (liveRoot.contains(range.commonAncestorContainer)) {
          // Language is read at click time so new footnotes follow the
          // current EN/FR switch (existing footnotes are never rewritten).
          const lang = S.i18n ? S.i18n.getLanguage() : "en";
          const n = nextFootnoteNumber(liveRoot);
          const ref = buildFootnoteReference(n, lang);
          range.deleteContents();
          range.insertNode(ref);
          const after = range.cloneRange();
          after.setStartAfter(ref);
          after.collapse(true);
          sel.removeAllRanges();
          sel.addRange(after);
          ensureFootnotesAside(liveRoot, lang).appendChild(buildFootnoteEntry(n, text, lang));
          onChange();
          if (config.onInserted) config.onInserted(n);
          return;
        }
      }
      if (config.onError) config.onError("Click in the document first, then insert a footnote.");
    });
  }

  S.footnotes = {
    buildFootnoteReference,
    buildFootnoteEntry,
    nextFootnoteNumber,
    ensureFootnotesAside,
    mountFootnotes
  };
})(window.Scribe || (window.Scribe = {}));
