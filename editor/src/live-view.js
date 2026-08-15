// Live view: a contentEditable region that renders the document visually and
// writes edits back to the model. Refresh-on-blur sync is wired in sync.js.
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createLiveView(element, model, refs) {
    const ChangeSource = refs.ChangeSource;

    // Push model -> contentEditable, skipping changes the live view
    // originated. When the region is unfocused (the follower case), the
    // re-render is scroll-anchored: the block at the top of the viewport is
    // identified (block-index path, source-map.js), and after the innerHTML
    // swap the corresponding new node is aligned back to its previous
    // position (view-linking spec: scroll preservation on background
    // refresh). Zero-geometry environments degrade to a plain re-render.
    const unsubscribe = model.subscribe((html, source) => {
      if (source === ChangeSource.live) return;
      if (element.innerHTML !== html) renderPreservingScroll(html);
    });

    function renderPreservingScroll(html) {
      const doc = element.ownerDocument;
      const active = doc && doc.activeElement && element.contains(doc.activeElement);
      if (active || !S.pickTopAnchor || !S.blockViewportEntries) {
        element.innerHTML = html;
        return;
      }
      const anchor = S.pickTopAnchor(
        S.blockViewportEntries(element),
        element.getBoundingClientRect().top
      );
      const anchorPath = anchor ? S.liveBlockPath(element, anchor.el) : null;
      let beforeTop = 0;
      if (anchorPath) {
        beforeTop = anchor.el.getBoundingClientRect().top - element.getBoundingClientRect().top;
      }
      element.innerHTML = html;
      if (!anchorPath) return;
      const next = S.resolveBlockPath(element, anchorPath);
      if (!next || !next.getBoundingClientRect) return;
      const afterTop = next.getBoundingClientRect().top - element.getBoundingClientRect().top;
      const delta = afterTop - beforeTop;
      if (!delta) return;
      // The surface itself may not be the scroller (the page scrolls
      // instead): apply to the element, and if it cannot scroll, adjust the
      // window so the anchored block stays under the user's eyes.
      const before = element.scrollTop;
      element.scrollTop = before + delta;
      if (element.scrollTop === before) {
        const view = doc.defaultView;
        if (view && typeof view.scrollBy === "function") view.scrollBy(0, delta);
      }
    }

    // Initial projection.
    element.innerHTML = model.getHTML();

    return {
      element,
      /** Read the rendered HTML for the document model. Editor-only state is
       *  stripped (.selected/.hovered), <b>/<i> canonicalized to <strong>/<em>
       *  (Canada.ca/WET preference), every table guaranteed a
       *  .table-responsive wrapper, and the result pretty-printed — so the
       *  model (Code view, Copy output, autosave) is always canonical. */
      read() {
        const clone = element.cloneNode(true);
        // Strip ALL editor-only state via the shared canonicalizer (see
        // source-map.js stripEditorState): table-editor selection classes,
        // hover/flash highlight classes, and empty class attributes — so
        // the model (Code view, Copy output, autosave) is always canonical
        // and self-heals documents polluted by older builds.
        if (S.stripEditorState) S.stripEditorState(clone);
        if (S.normalizeBoldItalic) S.normalizeBoldItalic(clone);
        if (S.ensureTableResponsive) S.ensureTableResponsive(clone);
        if (S.stripWordBookmarks) S.stripWordBookmarks(clone);
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
