import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Document-level undo/redo (document-history spec):
//   - createHistory: pure two-stack shuffle, cap eviction, empty guards
//   - DocumentModel.setHTML label plumbing (backward compatible)
//   - mountHistory: capture of command/paste/docx writes only, restore
//     through the model pipeline, button reflection, toasts
//   - keyboard routing: table-editor priority, native-undo stand-down
//     inside the editing surfaces, document-level undo from page chrome

const win = loadScribe(["document-model.js", "history.js", "toasts.js"]);
const S = win.Scribe;
const document = win.document;

function keydown(target, opts) {
  const e = new win.KeyboardEvent("keydown", {
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    shiftKey: !!opts.shift,
    bubbles: true,
    cancelable: true
  });
  target.dispatchEvent(e);
  return e;
}

describe("createHistory (pure)", () => {
  it("push/undo/redo round-trips states", () => {
    const h = S.createHistory({ cap: 10 });
    expect(h.canUndo()).toBe(false);
    h.push("<p>one</p>", "First");
    h.push("<p>one</p>", "Second"); // pre-write state of the 2nd write
    expect(h.canUndo()).toBe(true);
    const e1 = h.undo("<p>two</p>");
    expect(e1.html).toBe("<p>one</p>");
    expect(e1.label).toBe("Second");
    expect(h.canRedo()).toBe(true);
    const e2 = h.redo("<p>one</p>");
    expect(e2.html).toBe("<p>two</p>");
    expect(e2.label).toBe("Second");
    expect(h.canRedo()).toBe(false);
  });

  it("a new push clears the redo stack", () => {
    const h = S.createHistory({ cap: 10 });
    h.push("a", "One");
    h.undo("b");
    expect(h.canRedo()).toBe(true);
    h.push("c", "Two");
    expect(h.canRedo()).toBe(false);
    expect(h.redo("x")).toBe(null);
  });

  it("evicts the oldest entry at the cap", () => {
    const h = S.createHistory({ cap: 3 });
    h.push("s1", "A");
    h.push("s2", "B");
    h.push("s3", "C");
    h.push("s4", "D"); // cap exceeded -> drop "A" (oldest)
    expect(h.size()).toBe(3);
    // LIFO: the newest pre-state restores first; the oldest (s1) is gone.
    expect(h.undo("w1").html).toBe("s4");
    expect(h.undo("w2").html).toBe("s3");
    expect(h.undo("w3").html).toBe("s2");
    expect(h.canUndo()).toBe(false);
  });

  it("empty-stack guards and default labels", () => {
    const h = S.createHistory({ cap: 2 });
    expect(h.undo("x")).toBe(null);
    expect(h.redo("x")).toBe(null);
    expect(h.peekUndoLabel()).toBe(null);
    h.push("a"); // no label
    expect(h.peekUndoLabel()).toBe("Edit document");
  });

  it("peeks the label of the next undo/redo action", () => {
    const h = S.createHistory({ cap: 5 });
    h.push("a", "Add IDs");
    expect(h.peekUndoLabel()).toBe("Add IDs");
    h.undo("b");
    expect(h.peekRedoLabel()).toBe("Add IDs");
  });
});

describe("DocumentModel label plumbing", () => {
  it("re-emits the label to subscribers and defaults when absent", () => {
    const model = new S.DocumentModel("");
    const seen = [];
    model.subscribe((html, source, label) => seen.push([html, source, label]));
    model.setHTML("<p>a</p>", "command", "Add IDs");
    model.setHTML("<p>b</p>", "paste");
    expect(seen[0]).toEqual(["<p>a</p>", "command", "Add IDs"]);
    expect(seen[1]).toEqual(["<p>b</p>", "paste", "Edit document"]);
  });

  it("two-argument calls behave exactly as before (no emit on identical html)", () => {
    const model = new S.DocumentModel("<p>x</p>");
    let count = 0;
    model.subscribe(() => count++);
    model.setHTML("<p>x</p>", "live"); // identical -> suppressed
    model.setHTML("<p>y</p>", "live"); // changed -> emits
    expect(count).toBe(1);
  });
});

describe("mountHistory: capture and restore", () => {
  it("captures command, paste, and docx writes; ignores live/code/raw/init", () => {
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, {});
    model.setHTML("<p>1</p>", "paste", "Paste document");
    model.setHTML("<p>1 typed</p>", "live");
    model.setHTML("<p>1 typed</p>", "code");
    model.setHTML("<p>2</p>", "docx", "Open document");
    model.setHTML("<p>2 more</p>", "command", "Add IDs");
    expect(ctl.canUndo()).toBe(true);
    // Undo the Add IDs write: pre-state was the docx result.
    const entry = ctl.undoAction();
    expect(entry.label).toBe("Add IDs");
    expect(model.getHTML()).toBe("<p>2</p>");
    // Undo again: pre-state of the docx write was the (live-edited) html.
    ctl.undoAction();
    expect(model.getHTML()).toBe("<p>1 typed</p>");
    // And again: pre-state of the paste was the empty document.
    ctl.undoAction();
    expect(model.getHTML()).toBe("");
    expect(ctl.canUndo()).toBe(false);
    ctl.detach();
  });

  it("undo after paste restores the pre-paste document", () => {
    const model = new S.DocumentModel("<p>prior work</p>");
    const ctl = S.mountHistory(model, {});
    model.setHTML("<p>new paste</p>", "paste", "Paste document");
    ctl.undoAction();
    expect(model.getHTML()).toBe("<p>prior work</p>");
    ctl.detach();
  });

  it("redo round-trips and is cleared by a new captured write", () => {
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, {});
    model.setHTML("<p>a</p>", "command", "Add IDs");
    expect(ctl.canUndo()).toBe(true);

    ctl.undoAction(); // -> "" ; the Add IDs result becomes redoable
    expect(model.getHTML()).toBe("");
    expect(ctl.canRedo()).toBe(true);

    // A new captured write clears the forward branch.
    model.setHTML("<p>b</p>", "command", "Generate ToC");
    expect(ctl.canRedo()).toBe(false);

    // Undo/redo now only spans the ToC write; the Add IDs branch is gone.
    ctl.undoAction();
    expect(model.getHTML()).toBe("");
    ctl.redoAction();
    expect(model.getHTML()).toBe("<p>b</p>");
    expect(ctl.canRedo()).toBe(false);
    ctl.detach();
  });

  it("restore writes refresh views through the model pipeline", () => {
    const model = new S.DocumentModel("<p>orig</p>");
    // Stand-ins for the Live/Code views: subscribers like the real ones.
    const view = { html: model.getHTML() };
    model.subscribe((html, source) => {
      if (source !== "live") view.html = html;
    });
    const ctl = S.mountHistory(model, {});
    model.setHTML("<p>changed</p>", "paste", "Paste document");
    expect(view.html).toBe("<p>changed</p>");
    ctl.undoAction();
    expect(view.html).toBe("<p>orig</p>"); // refreshed by the restore emit
    ctl.detach();
  });

  it("restore itself does not double-capture (undo/undo/redo/redo is stable)", () => {
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, {});
    model.setHTML("<p>1</p>", "command", "One");
    model.setHTML("<p>2</p>", "command", "Two");
    ctl.undoAction(); // -> 1
    ctl.undoAction(); // -> ""
    expect(model.getHTML()).toBe("");
    expect(ctl.canUndo()).toBe(false);
    ctl.redoAction(); // -> 1
    ctl.redoAction(); // -> 2
    expect(model.getHTML()).toBe("<p>2</p>");
    expect(ctl.canRedo()).toBe(false);
    expect(ctl.canUndo()).toBe(true);
    ctl.detach();
  });

  it("reflects availability on toolbar buttons", () => {
    const undoBtn = document.createElement("button");
    const redoBtn = document.createElement("button");
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, { undoBtn, redoBtn });
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);
    model.setHTML("<p>a</p>", "command", "Add IDs");
    expect(undoBtn.disabled).toBe(false);
    expect(undoBtn.title).toContain("Add IDs");
    ctl.undoAction(); // that was the only entry — undo empties, redo fills
    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(false);
    ctl.redoAction();
    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(true);
    ctl.detach();
  });

  it("toasts the undone and redone action names", () => {
    const shown = [];
    const toaster = { show: (msg, type) => shown.push([msg, type]) };
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, { toaster });
    model.setHTML("<p>a</p>", "command", "Add IDs");
    ctl.undoAction();
    ctl.redoAction();
    expect(shown[0]).toEqual(["Undid Add IDs", "info"]);
    expect(shown[1]).toEqual(["Redid Add IDs", "info"]);
    ctl.detach();
  });
});

describe("mountHistory: keyboard routing", () => {
  function setup(cfgOverrides) {
    const liveEl = document.createElement("div");
    liveEl.contentEditable = "true";
    const codeEl = document.createElement("textarea");
    document.body.appendChild(liveEl);
    document.body.appendChild(codeEl);
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(
      model,
      Object.assign({ liveEl, codeEl, keydownTarget: document }, cfgOverrides)
    );
    return { ctl, model, liveEl, codeEl };
  }

  it("Ctrl+Z from page chrome performs document undo", () => {
    const { ctl, model } = setup({});
    model.setHTML("<p>a</p>", "command", "Add IDs");
    const e = keydown(document, { key: "z", ctrl: true });
    expect(e.defaultPrevented).toBe(true);
    expect(model.getHTML()).toBe("");
    ctl.detach();
  });

  it("Cmd+Shift+Z and Ctrl+Y perform redo", () => {
    const { ctl, model } = setup({});
    model.setHTML("<p>a</p>", "command", "Add IDs");
    ctl.undoAction();
    const eY = keydown(document, { key: "y", ctrl: true });
    expect(eY.defaultPrevented).toBe(true);
    expect(model.getHTML()).toBe("<p>a</p>");
    ctl.undoAction();
    const eZ = keydown(document, { key: "z", meta: true, shift: true });
    expect(eZ.defaultPrevented).toBe(true);
    expect(model.getHTML()).toBe("<p>a</p>");
    ctl.detach();
  });

  it("stands down while focus is in the Live view or Code textarea", () => {
    const { ctl, model, liveEl, codeEl } = setup({});
    model.setHTML("<p>a</p>", "command", "Add IDs");
    liveEl.focus();
    keydown(document, { key: "z", ctrl: true });
    expect(model.getHTML()).toBe("<p>a</p>"); // native undo kept
    codeEl.focus();
    keydown(document, { key: "z", ctrl: true });
    expect(model.getHTML()).toBe("<p>a</p>");
    expect(ctl.canUndo()).toBe(true); // history untouched
    ctl.detach();
  });

  it("stands down while the table editor is active", () => {
    let tableActive = true;
    const { ctl, model } = setup({
      isTableEditorActive: () => tableActive
    });
    model.setHTML("<p>a</p>", "command", "Add IDs");
    keydown(document, { key: "z", ctrl: true });
    expect(model.getHTML()).toBe("<p>a</p>");
    expect(ctl.canUndo()).toBe(true);
    // Once the table editor closes, document history takes over again.
    tableActive = false;
    const e = keydown(document, { key: "z", ctrl: true });
    expect(e.defaultPrevented).toBe(true);
    expect(model.getHTML()).toBe("");
    ctl.detach();
  });

  it("does nothing when stacks are empty (no preventDefault)", () => {
    const { ctl } = setup({});
    const e = keydown(document, { key: "z", ctrl: true });
    expect(e.defaultPrevented).toBe(false);
    ctl.detach();
  });

  it("stands down via the default keydown target when none is passed", () => {
    const liveEl = document.createElement("div");
    const codeEl = document.createElement("textarea");
    document.body.appendChild(liveEl);
    document.body.appendChild(codeEl);
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, { liveEl, codeEl }); // no keydownTarget -> document
    model.setHTML("<p>a</p>", "command", "Add IDs");
    codeEl.focus();
    keydown(document, { key: "z", ctrl: true });
    expect(model.getHTML()).toBe("<p>a</p>"); // native undo path
    codeEl.blur();
    keydown(document, { key: "z", ctrl: true });
    expect(model.getHTML()).toBe(""); // chrome focus -> document undo
    ctl.detach();
    liveEl.remove();
    codeEl.remove();
  });

  it("toolbar buttons invoke undo/redo directly", () => {
    const undoBtn = document.createElement("button");
    const redoBtn = document.createElement("button");
    const model = new S.DocumentModel("");
    const ctl = S.mountHistory(model, { undoBtn, redoBtn });
    model.setHTML("<p>a</p>", "command", "Add IDs");
    undoBtn.click();
    expect(model.getHTML()).toBe("");
    redoBtn.click();
    expect(model.getHTML()).toBe("<p>a</p>");
    ctl.detach();
  });
});
