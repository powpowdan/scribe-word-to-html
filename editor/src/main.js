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

    S.wireSync(liveView, codeView, model, refs);

    S.wirePaste(liveView, model, refs, {
      onPaste: ({ warnings }) => showWarnings(warnings)
    });
    S.wireDocxUpload($("docxFile"), model, refs, {
      onError: (msg) => alert(msg)
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
        gutter: $("codeLineNumbers"),
        findPanel: $("codeFindPanel"),
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

    // Toasts (transient notifications).
    const toaster = S.createToaster ? S.createToaster($("toastRegion")) : null;

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
          model.setHTML(record.html, ChangeSource.command);
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
        onChange: () => model.setHTML(liveView.read(), ChangeSource.live)
      });
    }

    // Document structure commands: Add IDs + On this page. Operate on the Live
    // view's DOM, then flush to the model (source 'live' preserves the Live
    // DOM so the Code view updates without a Live re-render).
    function flushLive() {
      model.setHTML(liveView.read(), ChangeSource.live);
    }
    if (S.documentCommands) {
      const addIdsBtn = $("addIdsBtn");
      if (addIdsBtn) {
        addIdsBtn.addEventListener("click", () => {
          S.documentCommands.addIds(liveView.element);
          flushLive();
          if (toaster) toaster.show("IDs added", "success");
        });
      }
      const otpBtn = $("onThisPageBtn");
      if (otpBtn) {
        otpBtn.addEventListener("click", () => {
          const depthSel = $("otpDepth");
          const depth = depthSel ? parseInt(depthSel.value, 10) : 2;
          const ok = S.documentCommands.addOnThisPage(liveView.element, { depth: depth });
          flushLive();
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.Scribe || (window.Scribe = {}));
