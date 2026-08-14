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
      /** Read the rendered HTML for the document model. Editor-only state is
       *  stripped (.selected/.hovered), <b>/<i> canonicalized to <strong>/<em>
       *  (Canada.ca/WET preference), and the result pretty-printed with
       *  block-level line breaks — so the model (and therefore the Code view,
       *  Copy output, and autosave) always holds readable HTML. */
      read() {
        const clone = element.cloneNode(true);
        clone.querySelectorAll(".selected, .hovered").forEach((el) => {
          el.classList.remove("selected", "hovered");
        });
        if (S.normalizeBoldItalic) S.normalizeBoldItalic(clone);
        return S.prettyHTML(clone);
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
