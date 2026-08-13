// Entry paths: paste (Word clipboard -> cleanup -> model), .docx upload
// (mammoth -> model), and raw HTML (Code view default behavior; no cleanup).
// See dual-view-editor spec ("Paste entry from Word clipboard", ".docx upload
// entry via mammoth", "Raw HTML entry").
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

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
      model.setHTML(result.html, ChangeSource.paste);
      if (typeof hooks.onPaste === "function") hooks.onPaste({ warnings: result.warnings });
    });
  }

  function wireDocxUpload(fileInput, model, refs, hooks) {
    const ChangeSource = refs.ChangeSource;
    hooks = hooks || {};

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (typeof window.mammoth === "undefined" || typeof window.mammoth.convertToHtml !== "function") {
        const msg = "mammoth library not loaded. Cannot convert .docx.";
        if (typeof hooks.onError === "function") hooks.onError(msg);
        else alert(msg);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        window.mammoth
          .convertToHtml({ arrayBuffer: ev.target.result })
          .then((result) => {
            const html = (result && result.value) || "";
            model.setHTML(html, ChangeSource.docx);
            if (typeof hooks.onDocx === "function") hooks.onDocx({ messages: result && result.messages });
          })
          .catch((err) => {
            console.error("mammoth conversion error:", err);
            const msg = "Could not convert .docx — see console.";
            if (typeof hooks.onError === "function") hooks.onError(msg);
            else alert(msg);
          });
      };
      reader.readAsArrayBuffer(file);
    });
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
  S.rawHtmlEntry = rawHtmlEntry;
})(window.Scribe || (window.Scribe = {}));
