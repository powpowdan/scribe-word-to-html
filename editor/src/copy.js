// Copy HTML control: serializes the document model to output HTML (image
// placeholders -> comments, empty elements stripped) and writes it to the
// clipboard. See dual-view-editor spec ("Copy HTML output") and the
// image-placeholders spec ("Placeholders serialize as comments in output").
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function wireCopyButton(button, model, hooks) {
    hooks = hooks || {};

    button.addEventListener("click", () => {
      // Flush any in-progress edit in the focused view into the model first.
      const active = document.activeElement;
      if (active && typeof active.blur === "function") active.blur();

      const output = S.serializeForOutput(model.getHTML());

      const onCopied = () => {
        if (typeof hooks.onCopied === "function") hooks.onCopied();
      };
      const onError = () => {
        if (typeof hooks.onError === "function") hooks.onError();
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(output)
          .then(onCopied)
          .catch(() => {
            if (legacyCopy(output)) onCopied();
            else onError();
          });
      } else if (legacyCopy(output)) {
        onCopied();
      } else {
        onError();
      }
    });
  }

  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  S.wireCopyButton = wireCopyButton;
})(window.Scribe || (window.Scribe = {}));
