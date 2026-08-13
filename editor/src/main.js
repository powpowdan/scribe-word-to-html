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

    // Debug handle for the acceptance check and power users. Not a public API.
    window.__scribe = { model, liveView, codeView };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.Scribe || (window.Scribe = {}));
