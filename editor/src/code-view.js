// Code view: an editable HTML textarea that projects from and writes back to
// the document model. Refresh-on-blur sync is wired in sync.js; this module
// owns only the textarea binding. Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createCodeView(textarea, model, refs) {
    const ChangeSource = refs.ChangeSource;

    // Programmatic value changes don't fire 'input' — dispatch a custom
    // signal so dependents (line-number gutter, syntax-highlight overlay)
    // can refresh. Written on every model->textarea push.
    function setValue(html) {
      textarea.value = html;
      textarea.dispatchEvent(new Event("scribe:code-write"));
    }

    // Push model -> textarea, but only when the change did not originate from
    // the code view itself (otherwise we would overwrite the user's typing).
    const unsubscribe = model.subscribe((html, source) => {
      if (source === ChangeSource.code) return;
      if (textarea.value !== html) setValue(html);
    });

    // Initial projection.
    setValue(model.getHTML());

    return {
      element: textarea,
      /** Read the current textarea contents (used by sync on blur). */
      read() {
        return textarea.value;
      },
      /** Write a value into the textarea without going through the model. */
      write(html) {
        setValue(html);
      },
      destroy() {
        unsubscribe();
      }
    };
  }

  S.createCodeView = createCodeView;
})(window.Scribe || (window.Scribe = {}));
