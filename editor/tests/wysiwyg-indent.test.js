import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// Coverage for the context-aware indent/outdent (WET margin ladder for prose,
// native nesting inside lists, NO <blockquote> path) and the selection-scoped
// NBSP action. Pure helpers + mount wiring (Selection API round-trips in
// happy-dom, so the button paths are exercised end-to-end).

const win = loadScribe(["wysiwyg.js"]);
const document = win.document;
const W = win.Scribe.wysiwyg;

function rootWith(html) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  document.body.appendChild(root);
  return root;
}

function select(root, startRef, startOff, endRef, endOff) {
  const r = document.createRange();
  r.setStart(startRef, startOff);
  r.setEnd(endRef, endOff);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  return r;
}

describe("applyIndentToBlock (WET margin ladder)", () => {
  it("steps up md -> lg -> xl and caps at xl", () => {
    const root = rootWith("<p>text</p>");
    const p = root.querySelector("p");
    expect(W.applyIndentToBlock(p, 1)).toBe(true);
    expect(p.className).toBe("mrgn-lft-md");
    expect(W.applyIndentToBlock(p, 1)).toBe(true);
    expect(p.className).toBe("mrgn-lft-lg");
    expect(W.applyIndentToBlock(p, 1)).toBe(true);
    expect(p.className).toBe("mrgn-lft-xl");
    expect(W.applyIndentToBlock(p, 1)).toBe(false); // capped
    expect(p.className).toBe("mrgn-lft-xl");
  });

  it("steps down xl -> lg -> md -> clean; below clean is a no-op", () => {
    const root = rootWith('<p class="mrgn-lft-xl">text</p>');
    const p = root.querySelector("p");
    W.applyIndentToBlock(p, -1);
    expect(p.className).toBe("mrgn-lft-lg");
    W.applyIndentToBlock(p, -1);
    expect(p.className).toBe("mrgn-lft-md");
    expect(W.applyIndentToBlock(p, -1)).toBe(true);
    expect(p.className).toBe(""); // clean
    expect(W.applyIndentToBlock(p, -1)).toBe(false); // no-op below clean
    expect(p.className).toBe("");
  });
});

describe("proseBlocksInSelection / isInList", () => {
  it("returns every prose block from the start block through the end block", () => {
    const root = rootWith("<p id='a'>one</p><p id='b'>two</p><p id='c'>three</p>");
    const a = root.querySelector("#a").firstChild;
    const c = root.querySelector("#c").firstChild;
    const range = select(root, a, 0, c, 5);
    const blocks = W.proseBlocksInSelection(root, range);
    expect(blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("detects list context and non-list context", () => {
    const listRoot = rootWith("<ul><li>item</li></ul>");
    const liText = listRoot.querySelector("li").firstChild;
    expect(W.isInList(liText, listRoot)).toBe(true);

    const pRoot = rootWith("<p>plain</p>");
    expect(W.isInList(pRoot.querySelector("p").firstChild, pRoot)).toBe(false);
  });
});

describe("indent wiring (mount)", () => {
  beforeEach(() => {
    document.execCommand = (...a) => (document._calls = document._calls || []).push(a);
    document.queryCommandState = () => false;
    document._calls = [];
  });

  function makeToolbar() {
    const tb = document.createElement("div");
    const btn = document.createElement("button");
    btn.setAttribute("data-cmd", "indent");
    tb.appendChild(btn);
    return tb;
  }

  it("prose indent applies the WET ladder and NEVER dispatches execCommand (no blockquote path)", () => {
    const root = rootWith("<p>plain paragraph</p>");
    const text = root.querySelector("p").firstChild;
    let changes = 0;
    const tb = makeToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() { changes++; } });

    select(root, text, 0, text, 15);
    tb.querySelector("[data-cmd='indent']").dispatchEvent(new win.Event("click"));

    expect(document._calls.length).toBe(0); // the regression: execCommand('indent') would make a <blockquote>
    expect(root.querySelector("p").classList.contains("mrgn-lft-md")).toBe(true);
    expect(changes).toBe(1);
  });

  it("multi-block selection ladders every touched block", () => {
    const root = rootWith("<p id='a'>one</p><p id='b'>two</p>");
    const a = root.querySelector("#a").firstChild;
    const b = root.querySelector("#b").firstChild;
    const tb = makeToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    select(root, a, 0, b, 3);
    tb.querySelector("[data-cmd='indent']").dispatchEvent(new win.Event("click"));

    expect(root.querySelector("#a").classList.contains("mrgn-lft-md")).toBe(true);
    expect(root.querySelector("#b").classList.contains("mrgn-lft-md")).toBe(true);
  });

  it("inside a list, indent dispatches the native command (correct nesting)", () => {
    const root = rootWith("<ul><li>item</li></ul>");
    const liText = root.querySelector("li").firstChild;
    const tb = makeToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    select(root, liText, 0, liText, 4);
    tb.querySelector("[data-cmd='indent']").dispatchEvent(new win.Event("click"));

    expect(document._calls.some((c) => c[0] === "indent")).toBe(true);
  });

  it("bare table cell defers to the table toolbar via a notify message", () => {
    const root = rootWith("<table><tbody><tr><td>cell</td></tr></tbody></table>");
    const tdText = root.querySelector("td").firstChild;
    const tb = makeToolbar();
    const notes = [];
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {}, notify(m) { notes.push(m); } });

    select(root, tdText, 0, tdText, 4);
    tb.querySelector("[data-cmd='indent']").dispatchEvent(new win.Event("click"));

    expect(document._calls.length).toBe(0);
    expect(notes.length).toBe(1);
    expect(notes[0]).toContain("table toolbar");
  });
});

describe("nbspTextNode / nbspRange", () => {
  it("nbspTextNode converts only the [start, end) portion", () => {
    const root = rootWith("<p>FedDev Ontario funding</p>");
    const tn = root.querySelector("p").firstChild;
    expect(W.nbspTextNode(tn, 0, 12)).toBe(1); // "FedDev Ontario" -> one space
    expect(tn.nodeValue).toBe("FedDev\u00A0Ontario funding"); // rest untouched
  });

  it("nbspTextNode returns 0 when there are no spaces in the portion", () => {
    const root = rootWith("<p>FedDev-Ontario</p>");
    const tn = root.querySelector("p").firstChild;
    expect(W.nbspTextNode(tn, 0, 15)).toBe(0);
    expect(tn.nodeValue).toBe("FedDev-Ontario");
  });

  it("nbspRange converts a partial single-node selection", () => {
    const root = rootWith("<p>FedDev Ontario and more words here</p>");
    const tn = root.querySelector("p").firstChild;
    const range = select(root, tn, 0, tn, 13); // "FedDev Ontario"
    expect(W.nbspRange(range)).toBe(1);
    expect(tn.nodeValue.startsWith("FedDev\u00A0Ontario")).toBe(true);
    expect(tn.nodeValue).toContain(" more words here"); // outside untouched
  });

  it("nbspRange spans inline elements and leaves text after the selection alone", () => {
    const root = rootWith("<p>alpha beta <strong>gamma delta</strong> epsilon zeta</p>");
    const p = root.querySelector("p");
    const first = p.firstChild; // "alpha beta "
    const strongText = p.querySelector("strong").firstChild; // "gamma delta"
    const range = select(root, first, 0, strongText, 10); // through "gamma delta"

    expect(W.nbspRange(range)).toBe(3); // "alpha beta" + "gamma delta" = 3 spaces
    expect(first.nodeValue).toBe("alpha\u00A0beta\u00A0"); // trailing space (inside range) converted
    expect(strongText.nodeValue).toBe("gamma\u00A0delta");
    // Text AFTER the selection end (sibling text node) must be untouched:
    expect(p.lastChild.nodeValue).toBe(" epsilon zeta");
  });

  it("collapsed range converts nothing", () => {
    const root = rootWith("<p>a b</p>");
    const tn = root.querySelector("p").firstChild;
    const range = select(root, tn, 0, tn, 0);
    expect(W.nbspRange(range)).toBe(0);
  });
});

describe("NBSP wiring (mount)", () => {
  beforeEach(() => {
    document.execCommand = (...a) => (document._calls = document._calls || []).push(a);
    document.queryCommandState = () => false;
    document._calls = [];
  });

  it("button converts spaces in the selection and flushes the model", () => {
    const root = rootWith("<p>FedDev Ontario</p>");
    const tn = root.querySelector("p").firstChild;
    const btn = document.createElement("button");
    btn.id = "nbspProseBtn";
    let changes = 0;
    W.mountWysiwyg({ liveRoot: root, toolbar: document.createElement("div"), nbspBtn: btn, onChange() { changes++; } });

    select(root, tn, 0, tn, 13);
    btn.dispatchEvent(new win.Event("click"));

    expect(tn.nodeValue).toBe("FedDev\u00A0Ontario");
    expect(changes).toBe(1);
  });

  it("no selection -> warning, no conversion", () => {
    const root = rootWith("<p>FedDev Ontario</p>");
    const btn = document.createElement("button");
    const notes = [];
    document.getSelection().removeAllRanges();
    W.mountWysiwyg({ liveRoot: root, toolbar: document.createElement("div"), nbspBtn: btn, onChange() {}, notify(m, t) { notes.push([m, t]); } });

    btn.dispatchEvent(new win.Event("click"));
    expect(root.querySelector("p").firstChild.nodeValue).toBe("FedDev Ontario");
    expect(notes.length).toBe(1);
    expect(notes[0][1]).toBe("warn");
  });
});

describe("createLink edit flow (prefill / unlink / no-op)", () => {
  beforeEach(() => {
    document.execCommand = (...a) => (document._calls = document._calls || []).push(a);
    document.queryCommandState = () => false;
    document._calls = [];
  });

  function makeLinkToolbar() {
    const tb = document.createElement("div");
    const btn = document.createElement("button");
    btn.setAttribute("data-cmd", "createLink");
    tb.appendChild(btn);
    return tb;
  }

  it("prompt is pre-filled with the existing href when the selection is inside a link", () => {
    const root = rootWith('<p><a href="https://old.example">old link</a></p>');
    const anchorText = root.querySelector("a").firstChild;
    const prompts = [];
    win.prompt = (msg, def) => { prompts.push(def); return null; }; // cancel
    const tb = makeLinkToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    select(root, anchorText, 0, anchorText, 8);
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));

    expect(prompts).toEqual(["https://old.example"]);
  });

  it("editing in place: new URL updates the anchor without execCommand", () => {
    const root = rootWith('<p><a href="https://old.example">old link</a></p>');
    win.prompt = () => "https://new.example";
    const tb = makeLinkToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    const anchorText = root.querySelector("a").firstChild;
    select(root, anchorText, 0, anchorText, 8);
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));

    expect(root.querySelector("a").getAttribute("href")).toBe("https://new.example");
    expect(root.querySelector("a").textContent).toBe("old link"); // text kept
    expect(document._calls.length).toBe(0); // setAttribute path, not execCommand
  });

  it("clearing the field removes the link, keeping the text", () => {
    const root = rootWith('<p>before <a href="https://x.example">link text</a> after</p>');
    win.prompt = () => ""; // cleared + OK
    const tb = makeLinkToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    const anchorText = root.querySelector("a").firstChild;
    select(root, anchorText, 0, anchorText, 9);
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));

    expect(root.querySelector("a")).toBe(null);
    expect(root.querySelector("p").textContent).toBe("before link text after");
  });

  it("cancel (prompt returns null) changes nothing", () => {
    const root = rootWith('<p><a href="https://old.example">old link</a></p>');
    win.prompt = () => null;
    const tb = makeLinkToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    const anchorText = root.querySelector("a").firstChild;
    select(root, anchorText, 0, anchorText, 8);
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));

    expect(root.querySelector("a").getAttribute("href")).toBe("https://old.example");
  });

  it("no anchor selected keeps the https:// default and dispatches createLink", () => {
    const root = rootWith("<p>plain text</p>");
    win.prompt = () => "https://make.example";
    const tb = makeLinkToolbar();
    W.mountWysiwyg({ liveRoot: root, toolbar: tb, onChange() {} });

    const text = root.querySelector("p").firstChild;
    select(root, text, 0, text, 10);
    tb.querySelector("[data-cmd='createLink']").dispatchEvent(new win.Event("click"));

    expect(document._calls.some((c) => c[0] === "createLink" && c[2] === "https://make.example")).toBe(true);
  });
});
