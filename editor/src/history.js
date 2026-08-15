// Document-level undo/redo over command, paste, and .docx writes.
//
// A bounded pair of stacks of pre-write HTML snapshots, each labeled with the
// action that produced the write ("Add IDs", "Paste document", ...). The pure
// createHistory() owns the two-stack shuffle; mountHistory() observes the
// document model, captures qualifying writes, restores snapshots through the
// normal model pipeline (so views, the QA panel, and recovery autosave all
// refresh), reflects availability on toolbar buttons, toasts the action name,
// and routes undo/redo keystrokes by focus context.
//
// Typing is deliberately NOT captured: Live/Code keep native browser undo,
// and the open table editor keeps its own per-table history (the router
// stands down for both). See document-history spec.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  var DEFAULT_CAP = 50;
  var DEFAULT_LABEL = "Edit document";

  // Captured sources: document-level transitions worth a snapshot. View
  // writes (live/code/raw) and init are not captured.
  function isCapturedSource(source) {
    return (
      source === "command" || source === "paste" || source === "docx"
    );
  }

  /**
   * Pure two-stack history. No DOM access.
   *
   * push(preWriteHtml, label) records the state a later undo returns to and
   * clears the redo stack (any new write invalidates the forward branch).
   * undo(currentHtml) / redo(currentHtml) pop the respective stack and push
   * the current state onto the opposite stack (the shuffle), returning the
   * entry to restore or null when that stack is empty.
   */
  function createHistory(opts) {
    var cap = (opts && opts.cap) || DEFAULT_CAP;
    var undoStack = []; // [{ html, label }] — pre-write states
    var redoStack = []; // [{ html, label }] — undone states, redoable

    function push(html, label) {
      undoStack.push({ html: String(html), label: label || DEFAULT_LABEL });
      if (undoStack.length > cap) undoStack.shift(); // drop oldest first
      redoStack.length = 0;
    }

    function undo(currentHtml) {
      if (undoStack.length === 0) return null;
      var entry = undoStack.pop();
      redoStack.push({ html: String(currentHtml), label: entry.label });
      return entry;
    }

    function redo(currentHtml) {
      if (redoStack.length === 0) return null;
      var entry = redoStack.pop();
      undoStack.push({ html: String(currentHtml), label: entry.label });
      return entry;
    }

    return {
      push: push,
      undo: undo,
      redo: redo,
      canUndo: function () { return undoStack.length > 0; },
      canRedo: function () { return redoStack.length > 0; },
      peekUndoLabel: function () {
        return undoStack.length ? undoStack[undoStack.length - 1].label : null;
      },
      peekRedoLabel: function () {
        return redoStack.length ? redoStack[redoStack.length - 1].label : null;
      },
      size: function () { return undoStack.length; }
    };
  }

  /**
   * Wire a history to a document model and (optionally) toolbar buttons,
   * toasts, and keyboard routing.
   *
   * config:
   *   cap                  — snapshot cap (default 50)
   *   undoBtn / redoBtn    — toolbar buttons reflecting availability
   *   toaster              — { show(message, type) } for action toasts
   *   isTableEditorActive  — () => boolean; true while the table editor
   *                          should keep undo/redo for itself
   *   liveEl / codeEl      — editing surfaces whose focus means native undo
   *   keydownTarget        — element for the capture-phase listener
   *                          (default: the global document)
   */
  function mountHistory(model, config) {
    config = config || {};
    var keydownTarget = config.keydownTarget || document;
    var history = createHistory({ cap: config.cap });
    var lastHtml = model.getHTML();

    // Restores are model writes with source "command", but the shuffle in
    // createHistory already recorded the transition atomically — capturing
    // them again would corrupt both stacks (see design.md: restore counts
    // as a capturable *transition*, not a second push).
    var restoring = false;

    function onEmit(html, source, label) {
      if (restoring) {
        lastHtml = html;
        return;
      }
      if (isCapturedSource(source)) {
        history.push(lastHtml, label);
      }
      lastHtml = html;
      refreshButtons();
    }

    var unsubscribe = model.subscribe(onEmit);

    function undoAction() {
      if (!history.canUndo()) return null;
      var entry = history.undo(model.getHTML());
      restoring = true;
      try {
        model.setHTML(entry.html, "command", entry.label);
      } finally {
        restoring = false;
      }
      refreshButtons();
      if (config.toaster) {
        config.toaster.show("Undid " + entry.label, "info");
      }
      return entry;
    }

    function redoAction() {
      if (!history.canRedo()) return null;
      var entry = history.redo(model.getHTML());
      restoring = true;
      try {
        model.setHTML(entry.html, "command", entry.label);
      } finally {
        restoring = false;
      }
      refreshButtons();
      if (config.toaster) {
        config.toaster.show("Redid " + entry.label, "info");
      }
      return entry;
    }

    function refreshButtons() {
      var undoBtn = config.undoBtn;
      var redoBtn = config.redoBtn;
      if (undoBtn) {
        var canU = history.canUndo();
        undoBtn.disabled = !canU;
        undoBtn.title = canU
          ? "Undo (" + history.peekUndoLabel() + ")"
          : "Undo";
      }
      if (redoBtn) {
        var canR = history.canRedo();
        redoBtn.disabled = !canR;
        redoBtn.title = canR
          ? "Redo (" + history.peekRedoLabel() + ")"
          : "Redo";
      }
    }

    // True when undo/redo keystrokes must NOT reach document history: the
    // table editor is mid-edit, or focus is inside an editing surface where
    // native (typing) undo applies.
    function shouldStandDown() {
      if (config.isTableEditorActive && config.isTableEditorActive()) {
        return true;
      }
      var active = keydownTarget.activeElement;
      if (!active) return false;
      return active === config.liveEl || active === config.codeEl;
    }

    function onKeydown(e) {
      var meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      var key = (e.key || "").toLowerCase();
      var isUndo = key === "z" && !e.shiftKey;
      // Ctrl+Y, or Ctrl/Cmd+Shift+Z (the macOS redo chord).
      var isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (shouldStandDown()) return;
      if (isUndo && !history.canUndo()) return;
      if (isRedo && !history.canRedo()) return;
      e.preventDefault();
      if (isUndo) undoAction();
      else redoAction();
    }

    keydownTarget.addEventListener("keydown", onKeydown, true);

    // Toolbar buttons invoke the actions directly — including while focus sits
    // inside an editing surface (they bypass the native-undo stand-down).
    if (config.undoBtn) config.undoBtn.addEventListener("click", undoAction);
    if (config.redoBtn) config.redoBtn.addEventListener("click", redoAction);

    refreshButtons();

    return {
      undoAction: undoAction,
      redoAction: redoAction,
      canUndo: function () { return history.canUndo(); },
      canRedo: function () { return history.canRedo(); },
      peekUndoLabel: function () { return history.peekUndoLabel(); },
      peekRedoLabel: function () { return history.peekRedoLabel(); },
      detach: function () {
        unsubscribe();
        keydownTarget.removeEventListener("keydown", onKeydown, true);
        if (config.undoBtn) config.undoBtn.removeEventListener("click", undoAction);
        if (config.redoBtn) config.redoBtn.removeEventListener("click", redoAction);
      }
    };
  }

  S.createHistory = createHistory;
  S.mountHistory = mountHistory;
  S.HISTORY_DEFAULT_CAP = DEFAULT_CAP;
})(window.Scribe || (window.Scribe = {}));
