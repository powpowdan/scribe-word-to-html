// Entry paths: paste (Word clipboard -> cleanup -> model), .docx upload
// (mammoth -> model), and raw HTML (Code view default behavior; no cleanup).
// See dual-view-editor spec ("Paste entry from Word clipboard", ".docx upload
// entry via mammoth", "Raw HTML entry").
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // Format every table in an HTML string (thead promotion, dark styling, WET
  // classes, table-responsive wrap) so pasted/.docx tables arrive formatted,
  // preserving the legacy renderCanvas UX. No-op if there are no tables.
  function withTablesFormatted(html) {
    if (!S.tableEditor || typeof S.tableEditor.formatTablesInContainer !== "function") {
      return html;
    }
    const container = document.createElement("div");
    container.innerHTML = html;
    S.tableEditor.formatTablesInContainer(container, { scope: true, trim: true });
    return container.innerHTML;
  }

  function wirePaste(liveView, model, refs, hooks) {
    const ChangeSource = refs.ChangeSource;
    const el = liveView.element;
    hooks = hooks || {};

    el.addEventListener("paste", (e) => {
      const cd = e.clipboardData || window.clipboardData;
      if (!cd) return;
      const html = cd.getData("text/html");
      const text = cd.getData("text/plain");
      let raw;
      if (html && html.trim().length > 0) {
        raw = S.extractFragment(html);
      } else if (text) {
        raw = S.plainTextToHtml(text);
      } else {
        return;
      }
      e.preventDefault();

      const result = S.cleanWordHtml(raw);
      const formatted = withTablesFormatted(result.html);
      model.setHTML(formatted, ChangeSource.paste, "Paste document");
      if (typeof hooks.onPaste === "function") hooks.onPaste({ warnings: result.warnings });
    });
  }

  // ===========================================================================
  // DOCX LANGUAGE DETECTION (run-level <w:lang> metadata)
  // ===========================================================================

  // Detection thresholds (tunable constants): a confident call needs at least
  // MIN_SAMPLE_CHARS of language-tagged run text and a language share of at
  // least PREDOMINANCE_SHARE. Below either -> null (state left untouched).
  var LANG_MIN_SAMPLE_CHARS = 200;
  var LANG_PREDOMINANCE_SHARE = 0.75;

  // Tally EN vs FR character counts from run-level <w:lang> declarations in
  // a word/document.xml payload. A flat regex scan of <w:r>…</w:r> runs —
  // deliberately no DOMParser (its XML support varies across environments);
  // detection degrades to zero counts on malformed input, never throws.
  // Runs with no known language tag are ignored entirely (they count toward
  // neither side nor the sample); unknown languages count as "other" only.
  function tallyLanguagesFromXml(xmlString) {
    var counts = { en: 0, fr: 0, other: 0 };
    var xml = String(xmlString == null ? "" : xmlString);
    var runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
    var langRe = /<w:lang\b[^>]*\bw:val\s*=\s*"([^"]*)"/;
    var m;
    while ((m = runRe.exec(xml)) !== null) {
      var langMatch = langRe.exec(m[1]);
      if (!langMatch) continue;
      var lang = langMatch[1].split("-")[0].toLowerCase();
      var text = m[1].replace(/<[^>]*>/g, "");
      if (lang === "en" || lang === "fr") counts[lang] += text.length;
      else counts.other += text.length;
    }
    return counts;
  }

  // Resolve "en" | "fr" | null for a .docx arrayBuffer by reading
  // word/document.xml through the vendored mammoth bundle's zip support.
  // Resolves null on any failure (missing API, bad zip, no document part,
  // ambiguous content) — detection must never block conversion.
  function detectDocxLanguage(arrayBuffer) {
    var mammoth = typeof window !== "undefined" ? window.mammoth : null;
    if (!mammoth || typeof mammoth._openZip !== "function") {
      return Promise.resolve(null);
    }
    return mammoth
      ._openZip({ arrayBuffer: arrayBuffer })
      .then(function (zip) {
        if (!zip || typeof zip.exists !== "function" || !zip.exists("word/document.xml")) {
          return null;
        }
        return zip.read("word/document.xml", "utf-8").then(function (xml) {
          var counts = tallyLanguagesFromXml(xml);
          var sample = counts.en + counts.fr;
          if (sample < LANG_MIN_SAMPLE_CHARS) return null;
          if (counts.fr / sample >= LANG_PREDOMINANCE_SHARE) return "fr";
          if (counts.en / sample >= LANG_PREDOMINANCE_SHARE) return "en";
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  // Shared .docx conversion path (dual-view-editor spec, ".docx upload entry
  // via mammoth"): used by BOTH the file-input change handler and the
  // paste-first hero's drop handler, so there is exactly one mammoth pipeline.
  // hooks: { onError, onDocxStart, onLanguageDetected, onDocx }
  function loadDocxFile(file, model, refs, hooks) {
    const ChangeSource = refs.ChangeSource;
    hooks = hooks || {};

    if (typeof window.mammoth === "undefined" || typeof window.mammoth.convertToHtml !== "function") {
      const msg = "mammoth library not loaded. Cannot convert .docx.";
      if (typeof hooks.onError === "function") hooks.onError(msg);
      else alert(msg);
      return;
    }

    if (typeof hooks.onDocxStart === "function") hooks.onDocxStart();

    const reader = new FileReader();
    reader.onload = (ev) => {
      // Language detection runs first so a confident result can set the
      // EN/FR state before generated content (footnote strings) is built.
      // A manual toggle earlier in the session wins over detection — the
      // host decides via onLanguageDetected; detection never blocks.
      detectDocxLanguage(ev.target.result)
        .then((lang) => {
          if (lang && typeof hooks.onLanguageDetected === "function") {
            hooks.onLanguageDetected(lang);
          }
        })
        .then(() =>
          window.mammoth.convertToHtml({ arrayBuffer: ev.target.result })
        )
        .then((result) => {
          // mammoth renders Word comments as [Author1] inline anchors plus a
          // trailing comment <dl>; strip them so comments never enter the
          // model. Footnotes convert to the WET pattern (paste path never
          // converts — clipboard footnote markup has no recoverable text).
          const warnings = [];
          const fn = S.convertMammothFootnotes
            ? S.convertMammothFootnotes(
                S.stripWordCommentsFromHtml((result && result.value) || "")
              )
            : { html: S.stripWordCommentsFromHtml((result && result.value) || ""), warnings: [] };
          (fn.warnings || []).forEach((w) => warnings.push(w));
          const html = withTablesFormatted(fn.html);
          model.setHTML(html, ChangeSource.docx, "Open document");
          if (typeof hooks.onDocx === "function") {
            hooks.onDocx({ messages: result && result.messages, warnings });
          }
        })
        .catch((err) => {
          console.error("mammoth conversion error:", err);
          const msg = "Could not convert .docx — see console.";
          if (typeof hooks.onError === "function") hooks.onError(msg);
          else alert(msg);
        });
    };
    reader.readAsArrayBuffer(file);
  }

  function wireDocxUpload(fileInput, model, refs, hooks) {
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      loadDocxFile(file, model, refs, hooks);
    });
  }

  // Paste-first empty state (ui-shell spec, "Paste-first empty state").
  // The hero overlays the Live surface while the document is empty: clicking
  // it focuses the contenteditable (paste stays the primary path); dropping a
  // .docx on it delegates to the same loadDocxFile pipeline as the file
  // input. Non-.docx drops are rejected through onInvalidFile.
  // Returns { update(html) } — the host calls it whenever the model changes.
  function wireEmptyHero(hero, liveEl, opts) {
    opts = opts || {};
    function update(html) {
      if (!hero) return;
      hero.hidden = !!String(html == null ? "" : html).trim();
    }
    if (hero) {
      hero.addEventListener("click", () => {
        if (liveEl && typeof liveEl.focus === "function") liveEl.focus();
      });
      hero.addEventListener("dragover", (e) => {
        e.preventDefault();
        hero.classList.add("drag-over");
      });
      hero.addEventListener("dragleave", () => {
        hero.classList.remove("drag-over");
      });
      hero.addEventListener("drop", (e) => {
        e.preventDefault();
        hero.classList.remove("drag-over");
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        if (!/\.docx$/i.test(file.name || "")) {
          if (typeof opts.onInvalidFile === "function") opts.onInvalidFile(file);
          return;
        }
        if (typeof opts.onDocxFile === "function") opts.onDocxFile(file);
      });
    }
    return { update: update };
  }

  // Raw-HTML entry is the Code view's default behavior: typing/pasting into the
  // textarea, then on blur sync.js writes it to the model without any cleanup.
  // No wiring is needed here; this function exists as an explicit no-op marker
  // so the entry surface is documented in one place.
  function rawHtmlEntry() {
    return "Raw HTML entry is handled by Code-view editing (see sync.js).";
  }

  S.wirePaste = wirePaste;
  S.wireDocxUpload = wireDocxUpload;
  S.loadDocxFile = loadDocxFile;
  S.wireEmptyHero = wireEmptyHero;
  S.rawHtmlEntry = rawHtmlEntry;
  S.tallyLanguagesFromXml = tallyLanguagesFromXml;
  S.detectDocxLanguage = detectDocxLanguage;
  S.LANG_MIN_SAMPLE_CHARS = LANG_MIN_SAMPLE_CHARS;
  S.LANG_PREDOMINANCE_SHARE = LANG_PREDOMINANCE_SHARE;
})(window.Scribe || (window.Scribe = {}));
