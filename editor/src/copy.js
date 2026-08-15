// Copy HTML control: serializes the document model to output HTML (image
// placeholders -> comments, empty elements stripped) and writes it to the
// clipboard. See dual-view-editor spec ("Copy HTML output" — the control
// lives in the app nav and is also reachable via Ctrl+Shift+C) and the
// image-placeholders spec ("Placeholders serialize as comments in output").
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function wireCopyButton(button, model, hooks) {
    hooks = hooks || {};

    // Shared path for the button click and the Ctrl+Shift+C shortcut.
    function triggerCopy() {
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
    }

    button.addEventListener("click", triggerCopy);
    return { triggerCopy: triggerCopy };
  }

  // Global Ctrl+Shift+C (and Cmd+Shift+C) → copy. Bound to `document` by
  // main.js so the terminal action is reachable from anywhere in the app.
  function wireCopyShortcut(target, triggerCopy) {
    if (!target || typeof triggerCopy !== "function") return;
    target.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        triggerCopy();
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
  S.wireCopyShortcut = wireCopyShortcut;
})(window.Scribe || (window.Scribe = {}));
