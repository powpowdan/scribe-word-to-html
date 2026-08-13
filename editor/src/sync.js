// Refresh-on-blur synchronization between Live and Code views.
//
// When a view loses focus, its committed content is written to the document
// model (tagged with that view's source), and the model's change event causes
// the *other* view to refresh. Caret position is intentionally NOT mapped
// across views in v1 (see dual-view-editor spec: "Refresh-on-blur
// synchronization between views").
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function wireSync(liveView, codeView, model, refs) {
    const ChangeSource = refs.ChangeSource;
    const codeEl = codeView.element;
    const liveEl = liveView.element;

    function onCodeBlur() {
      model.setHTML(codeView.read(), ChangeSource.code);
    }
    function onLiveBlur() {
      model.setHTML(liveView.read(), ChangeSource.live);
    }

    codeEl.addEventListener("blur", onCodeBlur);
    liveEl.addEventListener("blur", onLiveBlur);

    return {
      detach() {
        codeEl.removeEventListener("blur", onCodeBlur);
        liveEl.removeEventListener("blur", onLiveBlur);
      }
    };
  }

  S.wireSync = wireSync;
})(window.Scribe || (window.Scribe = {}));
