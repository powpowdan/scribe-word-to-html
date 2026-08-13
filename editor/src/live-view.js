// Live view: a contentEditable region that renders the document visually and
// writes edits back to the model. Refresh-on-blur sync is wired in sync.js.
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createLiveView(element, model, refs) {
    const ChangeSource = refs.ChangeSource;

    // Push model -> contentEditable, skipping changes the live view originated.
    const unsubscribe = model.subscribe((html, source) => {
      if (source === ChangeSource.live) return;
      if (element.innerHTML !== html) element.innerHTML = html;
    });

    // Initial projection.
    element.innerHTML = model.getHTML();

    return {
      element,
      /** Read the rendered HTML (used by sync on blur). */
      read() {
        return element.innerHTML;
      },
      /** Render HTML into the region without going through the model. */
      write(html) {
        element.innerHTML = html;
      },
      destroy() {
        unsubscribe();
      }
    };
  }

  S.createLiveView = createLiveView;
})(window.Scribe || (window.Scribe = {}));
