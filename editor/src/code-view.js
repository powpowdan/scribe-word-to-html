// Code view: an editable HTML textarea that projects from and writes back to
// the document model. Refresh-on-blur sync is wired in sync.js; this module
// owns only the textarea binding. Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createCodeView(textarea, model, refs) {
    const ChangeSource = refs.ChangeSource;

    // Push model -> textarea, but only when the change did not originate from
    // the code view itself (otherwise we would overwrite the user's typing).
    const unsubscribe = model.subscribe((html, source) => {
      if (source === ChangeSource.code) return;
      if (textarea.value !== html) textarea.value = html;
    });

    // Initial projection.
    textarea.value = model.getHTML();

    return {
      element: textarea,
      /** Read the current textarea contents (used by sync on blur). */
      read() {
        return textarea.value;
      },
      /** Write a value into the textarea without going through the model. */
      write(html) {
        textarea.value = html;
      },
      destroy() {
        unsubscribe();
      }
    };
  }

  S.createCodeView = createCodeView;
})(window.Scribe || (window.Scribe = {}));
