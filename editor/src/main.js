// Editor entry point. Wires the document model, the Live and Code views,
// refresh-on-blur sync, entry paths (paste, .docx, raw HTML), and Copy HTML.
// Loaded LAST (after the other src/ files) so window.Scribe is populated.
//
// Classic script — references window.Scribe.* (populated by the files loaded
// before this one in index.html).

(function (S) {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function flash(button, temporaryHTML, ms) {
    if (!button) return;
    button.classList.add("copy-success");
    const orig = button.innerHTML;
    button.innerHTML = temporaryHTML;
    clearTimeout(button._resetTimer);
    button._resetTimer = setTimeout(() => {
      button.classList.remove("copy-success");
      button.innerHTML = orig;
    }, ms || 1600);
  }

  function showWarnings(messages) {
    const banner = $("warningBanner");
    if (!banner) return;
    if (!messages || messages.length === 0) {
      banner.innerHTML = "";
      banner.style.display = "none";
      return;
    }
    banner.style.display = "block";
    banner.innerHTML = messages
      .map(
        () =>
          '<div class="alert alert-warning py-2 d-flex align-items-center" role="alert">' +
          '<i class="fa-solid fa-triangle-exclamation me-2"></i><span></span></div>'
      )
      .join("");
    const spans = banner.querySelectorAll(".alert span");
    messages.forEach((m, i) => {
      if (spans[i]) spans[i].textContent = m;
    });
  }

  function init() {
    const ChangeSource = S.ChangeSource;
    const refs = { ChangeSource };

    const model = new S.DocumentModel("");

    const liveView = S.createLiveView($("liveView"), model, refs);
    const codeView = S.createCodeView($("codeView"), model, refs);

    // Tidy-on-commit (view-linking spec): opt-in, persisted, default off.
    // When on, Code-view commits are canonicalized through the pretty-printer.
    const TIDY_KEY = "scribe.tidyOnCommit";
    let tidyOn = false;
    try {
      tidyOn = localStorage.getItem(TIDY_KEY) === "1";
    } catch (e) { /* storage unavailable */ }
    const tidyBtn = $("tidyToggleBtn");
    function refreshTidyButton() {
      if (!tidyBtn) return;
      tidyBtn.classList.toggle("active", tidyOn);
      tidyBtn.setAttribute("aria-pressed", String(tidyOn));
    }
    refreshTidyButton();
    if (tidyBtn) {
      tidyBtn.addEventListener("click", () => {
        tidyOn = !tidyOn;
        try {
          localStorage.setItem(TIDY_KEY, tidyOn ? "1" : "0");
        } catch (e) { /* storage unavailable */ }
        refreshTidyButton();
      });
    }

    // Split view: Live and Code side by side, each with its own scrolling.
    // Full-width: the sidebar is hidden and the shell widens so the panes
    // get most of the screen. Persisted; off (stacked) is the default.
    const SPLIT_KEY = "scribe.splitView";
    let splitOn = false;
    try {
      splitOn = localStorage.getItem(SPLIT_KEY) === "1";
    } catch (e) { /* storage unavailable */ }
    const panes = $("viewPanes");
    const splitBtn = $("splitViewBtn");
    function refreshSplit() {
      if (panes) panes.classList.toggle("split", splitOn);
      document.body.classList.toggle("scribe-split", splitOn);
      if (splitBtn) {
        splitBtn.classList.toggle("active", splitOn);
        splitBtn.setAttribute("aria-pressed", String(splitOn));
      }
    }
    refreshSplit();
    if (splitBtn) {
      splitBtn.addEventListener("click", () => {
        splitOn = !splitOn;
        try {
          localStorage.setItem(SPLIT_KEY, splitOn ? "1" : "0");
        } catch (e) { /* storage unavailable */ }
        refreshSplit();
      });
    }

    // Continuous focus-based sync (dual-view-editor spec): the focused view
    // is the debounced writer; the follower re-renders scroll-anchored.
    const syncHandle = S.wireSync(liveView, codeView, model, refs, {
      isTidyOnCommit: () => tidyOn
    });

    S.wirePaste(liveView, model, refs, {
      onPaste: ({ warnings }) => showWarnings(warnings)
    });
    S.wireDocxUpload($("docxFile"), model, refs, {
      onError: (msg) => alert(msg),
      // A fresh file open resets the manual-override flag so detection gets
      // a fresh chance; the toggle wins only until then.
      onDocxStart: () => { langManuallySet = false; },
      onLanguageDetected: (lang) => {
        if (langManuallySet || !S.i18n) return;
        S.i18n.setLanguage(lang);
        refreshLangButtons(lang);
        if (toaster) {
          toaster.show(lang === "fr" ? "Document detected as French" : "Document detected as English", "info");
        }
      },
      onDocx: ({ warnings }) => showWarnings(warnings)
    });

    S.wireCopyButton($("copyBtn"), model, {
      onCopied: () => flash($("copyBtn"), '<i class="fa-solid fa-check me-2"></i>Copied!'),
      onError: () => alert("Could not copy to clipboard.")
    });

    // Mount the table editor onto the Live view. After each table action the
    // Live view's HTML is flushed to the document model so the Code view stays
    // in sync; the Live view itself is not re-rendered (source skip), so the
    // user's selection and the DOM edits are preserved.
    const tableEditorAPI = S.tableEditor.mountTableEditor({
      liveRoot: liveView.element,
      toolbar: $("tableToolbar"),
      onChange: () => model.setHTML(liveView.read(), ChangeSource.live),
      getOpts: () => ({
        scope: $("scopeOpt") ? $("scopeOpt").checked : true,
        preset: $("presetSelect") ? $("presetSelect").value : "none"
      }),
      getActiveClass: () =>
        $("presetSelect") && $("presetSelect").value === "backgrounder" ? "bg-info" : "active",
      ids: {
        captionNumber: "captionNumber",
        captionTitle: "captionTitle",
        captionUnit: "captionUnit",
        tableId: "tableId",
        suggestIdBtn: "suggestIdBtn",
        suggestCaptionBtn: "suggestCaptionBtn",
        undoBtn: "undoBtn",
        redoBtn: "redoBtn",
        condensedOpt: "condensedOpt",
        stripedOpt: "stripedOpt",
        hoverOpt: "hoverOpt"
      }
    });

    // Debug handle for the acceptance check and power users. Not a public API.
    window.__scribe = { model, liveView, codeView, tableEditor: tableEditorAPI };

    // Code-view power features: line numbers, find/replace (+ regex), go-to-line.
    if (S.codeViewTools && $("codeView")) {
      S.codeViewTools.mountCodeViewTools({
        textarea: $("codeView"),
        gutter: $("codeLineNumbers"),        findPanel: $("codeFindPanel"),
        findInput: $("codeFindInput"),
        replaceInput: $("codeReplaceInput"),
        replaceRow: $("codeReplaceRow"),
        statusEl: $("codeFindStatus"),
        regexToggleBtn: $("codeFindRegexToggle"),
        prevBtn: $("codeFindPrevBtn"),
        nextBtn: $("codeFindNextBtn"),
        replaceBtn: $("codeReplaceBtn"),
        replaceAllBtn: $("codeReplaceAllBtn"),
        closeBtn: $("codeFindCloseBtn"),
        replaceToggleBtn: $("codeFindReplaceToggle"),
        goToLineBtn: $("goToLineBtn")
      });
    }

    // Syntax highlighting: decorative <pre> overlay behind the transparent-text
    // textarea (the textarea remains the source of truth).
    if (S.mountCodeHighlight && $("codeView") && $("codeHighlight")) {
      S.mountCodeHighlight({
        textarea: $("codeView"),
        pre: $("codeHighlight"),
        codeEl: $("codeHighlight").querySelector("code")
      });
    }

    // Toasts (transient notifications).
    const toaster = S.createToaster ? S.createToaster($("toastRegion")) : null;

    // View linking (view-linking spec): reveal in code / reveal in live,
    // switch-time position mapping, linked scrolling, hover highlighting.
    // The source map is cached per committed model HTML (rebuilds after each
    // commit; mid-edit queries degrade to the fallback matcher).
    if (S.buildSourceMap) {
      let mapCache = { forHtml: null, map: null };
      const getMap = () => {
        const html = model.getHTML();
        if (mapCache.forHtml !== html) {
          // Reuse a map whose canonical output already equals the committed
          // html (common after live-view commits: read() produced it).
          if (mapCache.map && mapCache.map.html === html) {
            mapCache.forHtml = html;
          } else {
            mapCache = { forHtml: html, map: S.buildSourceMap(liveView.element) };
          }
        }
        return mapCache.map;
      };
      const hoverAPI = S.hoverLink ? S.hoverLink.mountHoverLink({
        liveView, codeView, band: $("codeHoverBand"), getMap
      }) : null;
      const revealAPI = S.reveal ? S.reveal.mountReveal({
        liveView, codeView, model, toaster,
        locateBtn: $("locateInCodeBtn"),
        revealLiveBtn: $("revealLiveBtn"),
        liveCard: $("liveCard"),
        codeCard: $("codeCard"),
        hoverBand: hoverAPI,
        getMap
      }) : null;
      window.__scribe.reveal = revealAPI;
      window.__scribe.hoverLink = hoverAPI;
      window.__scribe.sync = syncHandle;
    }

    // Document-level undo/redo over command/paste/.docx writes (see
    // document-history spec). Typing keeps native undo inside the views;
    // the table editor keeps its own per-table history while active.
    if (S.mountHistory) {
      S.mountHistory(model, {
        cap: S.HISTORY_DEFAULT_CAP,
        undoBtn: $("docUndoBtn"),
        redoBtn: $("docRedoBtn"),
        toaster: toaster,
        isTableEditorActive: () =>
          !!(tableEditorAPI && tableEditorAPI.getActiveTable()),
        liveEl: liveView.element,
        codeEl: codeView.element
      });
    }

    // Bilingual EN/FR switch: governs publishing text GENERATED by commands
    // (On this page, footnotes). Non-retroactive — existing content keeps its
    // language. Persisted via i18n (localStorage). A manual toggle sets a
    // session flag that wins over .docx language detection until the next
    // file open (detection clears it and gets a fresh chance).
    let langManuallySet = false;
    function refreshLangButtons(lang) {
      const en = $("langEn");
      const fr = $("langFr");
      if (en) {
        en.classList.toggle("active", lang === "en");
        en.setAttribute("aria-pressed", String(lang === "en"));
      }
      if (fr) {
        fr.classList.toggle("active", lang === "fr");
        fr.setAttribute("aria-pressed", String(lang === "fr"));
      }
    }
    if (S.i18n) {
      refreshLangButtons(S.i18n.getLanguage());
      const wireLang = (id, lang) => {
        const b = $(id);
        if (!b) return;
        b.addEventListener("click", () => {
          langManuallySet = true;
          S.i18n.setLanguage(lang);
          refreshLangButtons(lang);
          if (toaster) {
            toaster.show(lang === "fr" ? "French — new content will use French" : "English — new content will use English", "info");
          }
        });
      };
      wireLang("langEn", "en");
      wireLang("langFr", "fr");
    }

    // Document recovery: debounced autosave + restore prompt on load.
    let recovery = null;
    if (S.documentRecovery) {
      recovery = S.documentRecovery.createRecovery({ model });
      recovery.start();

      const prompt = $("recoveryPrompt");
      if (prompt && recovery.shouldPrompt("")) {
        const record = recovery.getStored();
        const msg = $("recoveryMessage");
        if (msg) {
          const when = new Date(record.savedAt);
          msg.textContent =
            "An unsaved document from " + when.toLocaleString() + " is available.";
        }
        prompt.hidden = false;
        const wire = (id, fn) => {
          const b = $(id);
          if (b) b.addEventListener("click", fn);
        };
        wire("recoveryRestoreBtn", () => {
          model.setHTML(record.html, ChangeSource.command, "Restore document");
          prompt.hidden = true;
          if (toaster) toaster.show("Document restored", "success");
        });
        wire("recoveryDismissBtn", () => {
          prompt.hidden = true; // keep the copy for next load
        });
        wire("recoveryDiscardBtn", () => {
          recovery.discard();
          prompt.hidden = true;
          if (toaster) toaster.show("Recovery copy discarded", "info");
        });
      }
    }

    // Onboarding empty-state: visible only while the document is empty.
    function refreshOnboarding() {
      const hint = $("onboardingHint");
      if (!hint) return;
      hint.style.display = model.getHTML().trim() ? "none" : "";
    }
    model.subscribe(refreshOnboarding);
    refreshOnboarding();

    // WYSIWYG formatting toolbar for the Live view (bold/italic/lists/indent/
    // block-format/link). onChange flushes the Live view into the model so the
    // Code view stays live (mousedown preventDefault keeps focus in Live, so
    // the normal blur-sync would not fire).
    if (S.wysiwyg && $("wysiwygToolbar")) {
      S.wysiwyg.mountWysiwyg({
        liveRoot: liveView.element,
        toolbar: $("wysiwygToolbar"),
        blockSelect: $("blockFormatSelect"),
        nbspBtn: $("nbspProseBtn"),
        onChange: () => model.setHTML(liveView.read(), ChangeSource.live),
        notify: (msg, type) => { if (toaster) toaster.show(msg, type || "info"); }
      });
    }

    // Document structure commands: Add IDs + On this page. Operate on the Live
    // view's DOM, then flush to the model as a labeled command write (source
    // 'command' captures a history snapshot; the Live view re-renders from the
    // canonical model HTML, which is equivalent for button-driven commands).
    if (S.documentCommands) {
      const addIdsBtn = $("addIdsBtn");
      if (addIdsBtn) {
        addIdsBtn.addEventListener("click", () => {
          S.documentCommands.addIds(liveView.element);
          model.setHTML(liveView.read(), ChangeSource.command, "Add IDs");
          if (toaster) toaster.show("IDs added", "success");
        });
      }
      const otpBtn = $("onThisPageBtn");
      if (otpBtn) {
        otpBtn.addEventListener("click", () => {
          const depthSel = $("otpDepth");
          const depth = depthSel ? parseInt(depthSel.value, 10) : 2;
          const checked = (id) => {
            const el = $(id);
            return el ? !!el.checked : false;
          };
          const lang = S.i18n ? S.i18n.getLanguage() : "en";
          const ok = S.documentCommands.addOnThisPage(liveView.element, {
            depth: depth,
            lang: lang,
            numbered: checked("otpNumbered"),
            boldH2: checked("otpBold"),
            collapsible: checked("otpCollapse")
          });
          model.setHTML(liveView.read(), ChangeSource.command, "Generate ToC");
          if (toaster) toaster.show(ok ? '"On this page" inserted' : "No headings found", ok ? "success" : "warn");
        });
      }
    }

    // Document report panel (outline + issues + tag counts). Reads from the
    // model; click-to-jump navigation targets the Live view by id.
    if (S.qaPanel) {
      S.qaPanel.mountQaPanel({
        model: model,
        liveRoot: liveView.element,
        outlineEl: $("qaOutline"),
        issuesEl: $("qaIssues"),
        countInput: $("qaCountInput"),
        countBtn: $("qaCountBtn"),
        countResults: $("qaCountResults"),
        presetSelect: $("qaPresetSelect"),
        presetSaveBtn: $("qaPresetSaveBtn"),
        presetRecallBtn: $("qaPresetRecallBtn"),
        toaster: toaster
      });
    }

    // Footnotes — manual insert producing WET (GCWeb) footnote markup.
    if (S.footnotes && $("footnoteBtn")) {
      S.footnotes.mountFootnotes({
        liveRoot: liveView.element,
        button: $("footnoteBtn"),
        onChange: () => model.setHTML(liveView.read(), ChangeSource.command, "Insert footnote"),
        onInserted: (n) => { if (toaster) toaster.show("Footnote " + n + " inserted", "success"); },
        onError: (msg) => { if (toaster) toaster.show(msg, "warn"); else window.alert(msg); }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.Scribe || (window.Scribe = {}));
