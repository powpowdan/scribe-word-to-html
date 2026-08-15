import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Copy HTML (dual-view-editor spec, "Copy HTML output"): the control lives in
// the app nav and is also reachable via the global Ctrl+Shift+C shortcut;
// button click and shortcut share the triggerCopy path.

const win = loadScribe(["document-model.js", "cleanup.js", "copy.js"]);
const S = win.Scribe;
const document = win.document;

let written = null;
Object.defineProperty(win.navigator, "clipboard", {
  value: {
    writeText: (t) => {
      written = t;
      return Promise.resolve();
    }
  },
  configurable: true
});

function makeWiredButton(html) {
  const model = new S.DocumentModel(html);
  const btn = document.createElement("button");
  document.body.appendChild(btn);
  const ctl = S.wireCopyButton(btn, model, {});
  return { model, btn, ctl };
}

describe("Copy HTML", () => {
  it("button click still copies the current document", async () => {
    const { model, btn } = makeWiredButton("<p>via button</p>");
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(written).toContain("<p>via button</p>");
    expect(model.getHTML()).toContain("via button");
  });

  it("Ctrl+Shift+C keydown triggers the same copy path", async () => {
    const { ctl } = makeWiredButton("<p>via shortcut</p>");
    S.wireCopyShortcut(document, ctl.triggerCopy);
    const e = new win.KeyboardEvent("keydown", {
      key: "C",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true
    });
    document.dispatchEvent(e);
    await new Promise((r) => setTimeout(r, 0));
    expect(written).toContain("<p>via shortcut</p>");
    expect(e.defaultPrevented).toBe(true);
  });

  it("plain Ctrl+C and Ctrl+Shift+other keys do not trigger copy", () => {
    const { ctl } = makeWiredButton("<p>nope</p>");
    S.wireCopyShortcut(document, ctl.triggerCopy);
    written = null;
    document.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "c", ctrlKey: true, cancelable: true })
    );
    document.dispatchEvent(
      new win.KeyboardEvent("keydown", { key: "X", ctrlKey: true, shiftKey: true, cancelable: true })
    );
    expect(written).toBeNull();
  });
});
