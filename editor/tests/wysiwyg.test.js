import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// Wiring tests for the WYSIWYG toolbar. happy-dom does not implement
// execCommand/queryCommandState, so we inject spies and assert the toolbar
// dispatches the right command (and flushes onChange). Actual formatting is
// browser-verified.

const win = loadScribe(["wysiwyg.js"]);
const document = win.document;
const T = win.Scribe.wysiwyg;

function makeToolbar(cmds) {
  const tb = document.createElement("div");
  cmds.forEach((c) => {
    const b = document.createElement("button");
    b.setAttribute("data-cmd", c);
    tb.appendChild(b);
  });
  return tb;
}

describe("wysiwyg toolbar wiring", () => {
  beforeEach(() => {
    document.execCommand = (...a) => (document._calls = document._calls || []).push(a);
    document.queryCommandState = () => false;
    document._calls = [];
  });

  it("dispatches execCommand('bold') when the bold button is clicked", () => {
    const live = document.createElement("div");
    const tb = makeToolbar(["bold"]);
    T.mountWysiwyg({ liveRoot: live, toolbar: tb, onChange() {} });
    tb.querySelector("[data-cmd='bold']").dispatchEvent(new win.Event("click"));
    expect(document._calls.some((c) => c[0] === "bold")).toBe(true);
  });

  it("dispatches list / indent commands by their data-cmd", () => {
    const live = document.createElement("div");
    const tb = makeToolbar(["insertUnorderedList", "indent", "outdent"]);
    T.mountWysiwyg({ liveRoot: live, toolbar: tb, onChange() {} });
    tb.querySelector("[data-cmd='insertUnorderedList']").dispatchEvent(new win.Event("click"));
    tb.querySelector("[data-cmd='indent']").dispatchEvent(new win.Event("click"));
    const names = document._calls.map((c) => c[0]);
    expect(names).toContain("insertUnorderedList");
    expect(names).toContain("indent");
  });

  it("createLink prompts for a URL and dispatches createLink with it", () => {
    win.prompt = () => "https://example.com";
    const live = document.createElement("div");
    const tb = makeToolbar(["createLink"]);
    T.mountWysiwyg({ liveRoot: live, toolbar: tb, onChange() {} });
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));
    expect(document._calls.some((c) => c[0] === "createLink" && c[2] === "https://example.com")).toBe(true);
  });

  it("createLink does nothing when the prompt is cancelled", () => {
    win.prompt = () => null;
    const live = document.createElement("div");
    const tb = makeToolbar(["createLink"]);
    T.mountWysiwyg({ liveRoot: live, toolbar: tb, onChange() {} });
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));
    expect(document._calls.some((c) => c[0] === "createLink")).toBe(false);
  });

  it("onChange is invoked after a command so the model flushes", () => {
    const live = document.createElement("div");
    const tb = makeToolbar(["italic"]);
    let changed = 0;
    T.mountWysiwyg({ liveRoot: live, toolbar: tb, onChange() { changed++; } });
    tb.querySelector("[data-cmd='italic']").dispatchEvent(new win.Event("click"));
    expect(changed).toBe(1);
  });

  it("block-format select dispatches formatBlock with the chosen tag", () => {
    const live = document.createElement("div");
    const sel = document.createElement("select");
    ["", "p", "h2", "h3"].forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v || "Block";
      sel.appendChild(o);
    });
    T.mountWysiwyg({ liveRoot: live, toolbar: document.createElement("div"), blockSelect: sel, onChange() {} });
    sel.value = "h2";
    sel.dispatchEvent(new win.Event("change"));
    expect(document._calls.some((c) => c[0] === "formatBlock" && c[2] === "<h2>")).toBe(true);
  });
});
