// Code view: an editable HTML textarea that projects from and writes back to
// the document model. Refresh-on-blur sync is wired in sync.js; this module
// owns only the textarea binding. Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createCodeView(textarea, model, refs) {
    const ChangeSource = refs.ChangeSource;

    // Push model -> textarea, but only when the change did not originate from
    // the code view itself (otherwise we would overwrite the user's typing).
    // While the textarea is unfocused (the follower case: the user is typing
    // in Live or a toolbar command fired), scroll position and text selection
    // are captured before the value swap and restored after — a plain
    // textarea.value assignment resets scroll to the top in browsers
    // (view-linking spec: scroll/selection preservation on background
    // refresh). The 'scribe:code-write' event then re-syncs the highlight
    // overlay and line-number gutter (they read the restored scrollTop).
    const unsubscribe = model.subscribe((html, source) => {
      if (source === ChangeSource.code) return;
      if (textarea.value !== html) setValue(html);
    });

    function setValue(html) {
      const doc = textarea.ownerDocument;
      const active = doc && doc.activeElement === textarea;
      let st, sl, ss, se;
      if (!active) {
        st = textarea.scrollTop;
        sl = textarea.scrollLeft;
        ss = textarea.selectionStart;
        se = textarea.selectionEnd;
      }
      textarea.value = html;
      if (!active) {
        textarea.scrollTop = st;
        textarea.scrollLeft = sl;
        try {
          textarea.setSelectionRange(ss, se);
        } catch (e) {
          /* selection restore is best-effort */
        }
      }
      textarea.dispatchEvent(new Event("scribe:code-write"));
    }

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
