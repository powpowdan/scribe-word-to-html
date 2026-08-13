import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// Headless validation of the dual-view-editor contract: a single document
// model projected into Live + Code views with refresh-on-blur sync. The real
// browser is the final authority (acceptance 1.16), but these tests prove the
// wiring logic independently of any contentEditable quirks.
//
// Classic-script editor: load the modules into one happy-dom window and pull
// the API off the shared window.Scribe namespace.

const win = loadScribe([
  "document-model.js",
  "cleanup.js",
  "code-view.js",
  "live-view.js",
  "sync.js"
]);
const S = win.Scribe;
const document = win.document;
const { DocumentModel, ChangeSource, createLiveView, createCodeView, wireSync, serializeForOutput } = S;

describe("DocumentModel", () => {
  it("holds the HTML and emits to subscribers on setHTML", () => {
    const m = new DocumentModel("<p>start</p>");
    const seen = [];
    m.subscribe((html, source) => seen.push({ html, source }));

    expect(m.getHTML()).toBe("<p>start</p>");
    m.setHTML("<p>two</p>", ChangeSource.paste);
    expect(m.getHTML()).toBe("<p>two</p>");
    expect(seen).toEqual([{ html: "<p>two</p>", source: ChangeSource.paste }]);
  });

  it("unsubscribe stops further notifications", () => {
    const m = new DocumentModel();
    const seen = [];
    const off = m.subscribe((html) => seen.push(html));
    m.setHTML("a", ChangeSource.command);
    off();
    m.setHTML("b", ChangeSource.command);
    expect(seen).toEqual(["a"]);
  });

  it("does not emit when value is unchanged (non-init)", () => {
    const m = new DocumentModel("<p>x</p>");
    const seen = [];
    m.subscribe((html) => seen.push(html));
    m.setHTML("<p>x</p>", ChangeSource.live);
    expect(seen).toEqual([]);
  });
});

describe("dual-view refresh-on-blur sync", () => {
  let model, liveView, codeView;

  beforeEach(() => {
    document.body.innerHTML = "";
    const liveEl = document.createElement("div");
    liveEl.id = "live";
    liveEl.contentEditable = "true";
    const codeEl = document.createElement("textarea");
    codeEl.id = "code";
    document.body.appendChild(liveEl);
    document.body.appendChild(codeEl);

    model = new DocumentModel("<p>initial</p>");
    liveView = createLiveView(liveEl, model, { ChangeSource });
    codeView = createCodeView(codeEl, model, { ChangeSource });
    wireSync(liveView, codeView, model, { ChangeSource });
  });

  it("both views project the initial document", () => {
    expect(liveView.element.innerHTML).toBe("<p>initial</p>");
    expect(codeView.element.value).toBe("<p>initial</p>");
  });

  it("a programmatic paste into the model refreshes both views", () => {
    model.setHTML("<h2>Heading</h2>", ChangeSource.paste);
    expect(liveView.element.innerHTML).toBe("<h2>Heading</h2>");
    expect(codeView.element.value).toBe("<h2>Heading</h2>");
  });

  it("code edit propagates to live on blur (refresh-on-blur)", () => {
    // Simulate the user editing the code textarea then moving focus away.
    codeView.element.value = "<p>edited in code</p>";
    codeView.element.dispatchEvent(new win.Event("blur"));
    expect(model.getHTML()).toBe("<p>edited in code</p>");
    expect(liveView.element.innerHTML).toBe("<p>edited in code</p>");
  });

  it("live edit propagates to code on blur (refresh-on-blur)", () => {
    liveView.element.innerHTML = "<p>edited live</p>";
    liveView.element.dispatchEvent(new win.Event("blur"));
    expect(model.getHTML()).toBe("<p>edited live</p>");
    expect(codeView.element.value).toBe("<p>edited live</p>");
  });

  it("caret position is not mapped: a refresh resets rather than tracks the other view's caret", () => {
    // v1 deliberately does not map caret across views. Editing code and
    // blurring updates the model and refreshes live; there is no machinery
    // preserving a caret position, which is the accepted v1 trade-off.
    codeView.element.value = "<p>x</p>";
    codeView.element.dispatchEvent(new win.Event("blur"));
    expect(liveView.element.innerHTML).toBe("<p>x</p>");
    // No caret-state attribute is introduced by sync:
    expect(liveView.element.getAttribute("data-caret")).toBe(null);
  });
});

describe("Copy HTML serializes placeholders to comments", () => {
  it("document with an image placeholder copies a comment, not the figure", () => {
    // Models the Copy HTML control's output path (copy.js -> serializeForOutput).
    const model = new DocumentModel(
      '<p>Before <figure class="img-placeholder" data-img-alt="Chart">[IMAGE: Chart]</figure> After</p>'
    );
    const output = serializeForOutput(model.getHTML());
    expect(output).toContain("<!-- image: Chart -->");
    expect(output).not.toContain("img-placeholder");
    expect(output).not.toContain("[IMAGE");
  });
});
