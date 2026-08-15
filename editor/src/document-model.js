// Document model: the single source of truth for the editor's HTML content.
// Both the Live view and the Code view project from and write back to this
// model. Commands and the QA panel observe it via subscribe(). See
// dual-view-editor spec ("Document model is the single source of truth").
//
// Classic script (no ES modules) so the editor opens via file:// with no
// server. Attaches to the shared window.Scribe namespace.

(function (S) {
  "use strict";

  const ChangeSource = Object.freeze({
    live: "live",
    code: "code",
    paste: "paste",
    docx: "docx",
    raw: "raw",
    command: "command",
    init: "init"
  });

  class DocumentModel {
    constructor(initialHTML = "") {
      this._html = initialHTML;
      this._listeners = new Set();
    }

    /** Current document HTML. */
    getHTML() {
      return this._html;
    }

    /**
     * Replace the document HTML and notify subscribers.
     * `source` identifies the origin so a view can skip refreshing itself when
     * it was the writer (avoids clobbering an in-progress edit). See sync.js.
     * `label` (optional) names the action ("Add IDs", "Paste document", …);
     * it is re-emitted to subscribers so document history can name what a
     * later undo reverts. Untitled writes fall back to a generic label.
     */
    setHTML(html, source, label) {
      const next = html == null ? "" : String(html);
      const src = source || ChangeSource.command;
      if (next === this._html && src !== ChangeSource.init) return;
      this._html = next;
      this._emit(src, label);
    }

    /** Subscribe to changes. Returns an unsubscribe function. */
    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    _emit(source, label) {
      const lbl = label || "Edit document";
      for (const fn of this._listeners) {
        try {
          fn(this._html, source, lbl);
        } catch (err) {
          console.error("DocumentModel subscriber threw:", err);
        }
      }
    }
  }

  S.DocumentModel = DocumentModel;
  S.ChangeSource = ChangeSource;
})(window.Scribe || (window.Scribe = {}));
