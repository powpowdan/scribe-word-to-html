import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// Reveal (view-linking spec): caret->element->source navigation in both
// directions, switch-time mapping, and stay-put on no confident match.
// Linked scrolling: anchor computation both ways, loop guard, disabled mode.
// Hover linking: band placement, clientY->line conversion, non-destructiveness.

const win = loadScribe([
  "document-model.js",
  "cleanup.js",
  "format-html.js",
  "source-map.js",
  "code-view.js",
  "live-view.js",
  "sync.js",
  "code-view-tools.js",
  "reveal.js",
  "hover-link.js"
]);
const S = win.Scribe;
const document = win.document;
const { DocumentModel, ChangeSource, createLiveView, createCodeView, buildSourceMap } = S;

function setup(html) {
  document.body.innerHTML = "";
  const liveEl = document.createElement("div");
  liveEl.id = "live";
  liveEl.contentEditable = "true";
  const codeEl = document.createElement("textarea");
  codeEl.id = "code";
  const band = document.createElement("div");
  document.body.appendChild(liveEl);
  document.body.appendChild(codeEl);
  document.body.appendChild(band);

  const model = new DocumentModel(html);
  const liveView = createLiveView(liveEl, model, { ChangeSource });
  const codeView = createCodeView(codeEl, model, { ChangeSource });
  return { liveEl, codeEl, band, model, liveView, codeView };
}

describe("reveal — pure targets", () => {
  beforeEach(() => document.body.innerHTML === "");

  it("revealCodeTarget: paragraph caret -> exact opening-tag range", () => {
    const { liveEl, codeView } = setup("<h2>T</h2><p>Some text</p>");
    const map = buildSourceMap(liveEl);
    const el = liveEl.querySelector("p");
    const r = S.reveal.revealCodeTarget(map, codeView.read(), liveEl, el);
    expect(r).not.toBe(null);
    // Model html is the raw initial string here (map differs) -> fallback
    // coordinates are relative to the actual code text.
    expect(codeView.read().slice(r.start, r.end)).toBe("<p>");
  });

  it("revealCodeTarget: exact coordinates when the code text is canonical", () => {
    const { liveEl, codeView } = setup("<h2>T</h2><p>Some text</p>");
    const canonical = buildSourceMap(liveEl).html;
    codeView.write(canonical);
    const map = buildSourceMap(liveEl);
    const r = S.reveal.revealCodeTarget(map, codeView.read(), liveEl, liveEl.querySelector("p"));
    expect(canonical.slice(r.start, r.end)).toBe("<p>");
    expect(r.line).toBe(2);
  });

  it("revealCodeTarget: table-cell caret -> innermost element (the cell)", () => {
    const { liveEl, codeView } = setup("<table><tbody><tr><td>cell</td></tr></tbody></table>");
    const map = buildSourceMap(liveEl);
    const td = liveEl.querySelector("td");
    const r = S.reveal.revealCodeTarget(map, codeView.read(), liveEl, td);
    expect(codeView.read().slice(r.start, r.end)).toBe("<td>");
    expect(r.start).toBe(codeView.read().indexOf("<td>"));
  });

  it("revealCodeTarget: hand-edited code text falls back and stays confident", () => {
    const { liveEl } = setup('<h2 id="x">T</h2>');
    const map = buildSourceMap(liveEl);
    const hand = "noise\n   <h2 id=\"x\">T</h2>";
    const r = S.reveal.revealCodeTarget(map, hand, liveEl, liveEl.querySelector("h2"));
    expect(hand.slice(r.start, r.end)).toBe('<h2 id="x">');
  });

  it("revealCodeTarget: no confident match -> null (stay put)", () => {
    const { liveEl } = setup("<p>a</p><p>b</p>");
    const map = buildSourceMap(liveEl);
    expect(S.reveal.revealCodeTarget(map, "<div>gone</div>", liveEl, liveEl.querySelectorAll("p")[1])).toBe(null);
  });

  it("revealLiveTarget: code caret in a table's source -> that cell", () => {
    const { liveEl } = setup("<p>a</p><table><tbody><tr><td>c1</td><td>c2</td></tr></tbody></table>");
    const map = buildSourceMap(liveEl);
    const td2 = map.entries.find((e) => e.tag === "td" && map.html.slice(e.start, e.fullEnd).includes("c2"));
    const target = S.reveal.revealLiveTarget(map, map.html, td2.start + 5);
    expect(target.el.textContent).toBe("c2");
  });

  it("revealLiveTarget: caret in a comment -> nearest following element", () => {
    const { liveEl } = setup("<!-- lead --><p>x</p>");
    const map = buildSourceMap(liveEl);
    const inComment = map.html.indexOf("lead");
    const target = S.reveal.revealLiveTarget(map, map.html, inComment);
    expect(target.el.textContent).toBe("x");
  });

  it("revealLiveTarget: past the end -> null", () => {
    const { liveEl } = setup("<p>x</p>");
    const map = buildSourceMap(liveEl);
    expect(S.reveal.revealLiveTarget(map, map.html, map.html.length + 5)).toBe(null);
  });

  it("showRangeInCode scrolls proportionally and selects the opening tag", () => {
    const { codeEl } = setup("<p>a</p>");
    const html = "<p>a</p>\n<p>b</p>\n<p>c</p>";
    codeEl.value = html;
    Object.defineProperty(codeEl, "clientHeight", { value: 160, configurable: true });
    S.reveal.showRangeInCode(codeEl, { start: html.indexOf("<p>b"), end: html.indexOf("<p>b") + 4, line: 2 }, true);
    expect(codeEl.selectionStart).toBe(html.indexOf("<p>b"));
    expect(codeEl.selectionEnd).toBe(html.indexOf("<p>b") + 4);
    // line 2 centered in an 160px viewport at 16px/line: (2-1)*16 - 80 = -64 -> 0
    expect(codeEl.scrollTop).toBe(0);
    S.reveal.showRangeInCode(codeEl, { start: 0, end: 0, line: 12 }, false);
    expect(codeEl.scrollTop).toBeGreaterThan(0);
  });
});

describe("reveal — mount (click-to-jump)", () => {
  beforeEach(() => document.body.innerHTML === "");

  it("clicking a Live paragraph jumps Code to its source and pins the band", () => {
    const { liveEl, codeEl, liveView, codeView, model, band } = setup("<p>one</p>\n<p>two</p>");
    const hover = S.hoverLink.mountHoverLink({ liveView, codeView, band });
    S.reveal.mountReveal({ liveView, codeView, model, hoverBand: hover });
    Object.defineProperty(codeEl, "clientHeight", { value: 200, configurable: true });

    const p2 = liveEl.querySelectorAll("p")[1];
    // Mouse click (detail > 0) on the second paragraph.
    p2.dispatchEvent(new win.MouseEvent("click", { bubbles: true, detail: 1 }));

    expect(codeEl.selectionStart).toBe(codeEl.value.indexOf("<p>two"));
    expect(codeEl.selectionEnd).toBe(codeEl.selectionStart + "<p>".length);
    expect(band.hidden).toBe(false);
    expect(band.classList.contains("pinned")).toBe(true);
  });

  it("clicking a Code line jumps Live to the element and flashes it", () => {
    const { liveEl, codeEl, liveView, codeView, model } = setup("<p>one</p>\n<p>two</p>");
    S.reveal.mountReveal({ liveView, codeView, model });

    const off = codeEl.value.indexOf("two");
    codeEl.setSelectionRange(off, off);
    let flashed = null;
    const p2 = liveEl.querySelectorAll("p")[1];
    p2.scrollIntoView = () => { flashed = p2; };
    codeEl.dispatchEvent(new win.MouseEvent("click", { bubbles: true, detail: 1 }));

    expect(flashed).toBe(p2);
    expect(p2.classList.contains("scribe-flash")).toBe(true);
  });

  it("keyboard-synthesized clicks (detail 0) do not jump", () => {
    const { liveEl, codeEl, liveView, codeView, model } = setup("<p>one</p>\n<p>two</p>");
    S.reveal.mountReveal({ liveView, codeView, model });
    let jumped = false;
    liveEl.querySelectorAll("p")[1].scrollIntoView = () => { jumped = true; };
    codeEl.dispatchEvent(new win.MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(jumped).toBe(false);
    expect(codeEl.selectionStart).toBe(codeEl.selectionEnd); // untouched
  });

  it("typing never moves the other view (no jump on input events)", () => {
    const { liveEl, codeEl, liveView, codeView, model } = setup("<p>one</p>");
    S.reveal.mountReveal({ liveView, codeView, model });
    codeEl.setSelectionRange(0, 0);
    const before = { sel: 0, scroll: codeEl.scrollTop };
    // Typing in live — the follower refresh must not jump the code caret.
    liveEl.innerHTML = "<p>one edited</p>";
    liveEl.dispatchEvent(new win.Event("input"));
    liveEl.dispatchEvent(new win.Event("blur"));
    expect(codeEl.selectionStart).toBe(before.sel);
    expect(codeEl.selectionEnd).toBe(before.sel);
  });

  it("selectionchange tracks the live caret continuously (Locate works with no blur)", () => {
    const { liveEl, codeEl, liveView, codeView, model } = setup("<p>one</p>\n<p>two</p>");
    S.reveal.mountReveal({ liveView, codeView, model });

    const sel = document.getSelection();
    if (!(sel && sel.setBaseAndExtent)) return; // happy-dom Selection limits
    const p2 = liveEl.querySelectorAll("p")[1];
    sel.setBaseAndExtent(p2.firstChild, 0, p2.firstChild, 0);
    document.dispatchEvent(new win.Event("selectionchange"));

    Object.defineProperty(codeEl, "clientHeight", { value: 200, configurable: true });
    const api = S.reveal.mountReveal({ liveView, codeView, model });
    expect(api.revealInCode(false)).toBe(true);
    expect(codeEl.selectionStart).toBe(codeEl.value.indexOf("<p>two"));
    expect(codeEl.selectionEnd).toBe(codeEl.selectionStart + "<p>".length);
  });

  it("explicit reveal commits pending edits first, so the jump is not clobbered", () => {
    const { liveEl, codeEl, liveView, codeView, model } = setup("<p>one</p>\n<p>two</p>");
    S.reveal.mountReveal({ liveView, codeView, model });
    // Uncommitted live edit (still inside the debounce window).
    liveEl.innerHTML = "<p>one</p>\n<p>two edited</p>";
    const sel = document.getSelection();
    if (sel && sel.setBaseAndExtent) {
      const p2 = liveEl.querySelectorAll("p")[1];
      sel.setBaseAndExtent(p2.firstChild, 0, p2.firstChild, 0);
      document.dispatchEvent(new win.Event("selectionchange"));
      const api = S.reveal.mountReveal({ liveView, codeView, model });
      expect(api.revealInCode(false)).toBe(true);
      // The reveal committed the live edit AND landed past it.
      expect(model.getHTML()).toBe(liveView.read());
      expect(codeEl.value).toContain("two edited");
      expect(codeEl.selectionStart).toBe(codeEl.value.indexOf("<p>two edited"));
    }
  });
});

describe("hover linking — background gaps highlight nothing", () => {
  beforeEach(() => document.body.innerHTML === "");

  it("isPureContainer: blocks of only blocks are containers; text makes content", () => {
    const { liveEl } = setup(
      '<div class="table-responsive"><table><tbody><tr><td>x</td></tr></tbody></table></div>' +
      "<ul><li>item</li></ul><p>para</p>"
    );
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("div"))).toBe(true);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("table"))).toBe(true);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("tr"))).toBe(true);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("ul"))).toBe(true);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("li"))).toBe(false);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("td"))).toBe(false);
    expect(S.hoverLink.isPureContainer(liveEl.querySelector("p"))).toBe(false);
  });

  it("hovering a wrapper/ul (inter-item space) clears the band and class", () => {
    const ctx = setup("<ul><li>one</li><li>two</li></ul><p>para</p>");
    S.hoverLink.mountHoverLink({ liveView: ctx.liveView, codeView: ctx.codeView, band: ctx.band });

    // First hover real content: li shows the band.
    const li = ctx.liveEl.querySelector("li");
    li.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(ctx.band.hidden).toBe(false);

    // Move into the gap between list items: target is the <ul> container.
    const ul = ctx.liveEl.querySelector("ul");
    ul.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(li.classList.contains("scribe-hover-linked")).toBe(false);
    expect(ctx.band.hidden).toBe(true);
  });

  it("a pinned jump anchor survives hovering through gaps", () => {
    const ctx = setup("<ul><li>one</li><li>two</li></ul><p>para</p>");
    const hover = S.hoverLink.mountHoverLink({ liveView: ctx.liveView, codeView: ctx.codeView, band: ctx.band });

    // Simulate a click-to-jump pin (3-line range).
    hover.pinBand(3, 5);
    expect(ctx.band.classList.contains("pinned")).toBe(true);

    // Hover content, then cross a gap — the pin restores, not a blank hide.
    ctx.liveEl.querySelector("p").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(ctx.band.classList.contains("pinned")).toBe(false); // hover overrides
    ctx.liveEl.querySelector("ul").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(ctx.band.hidden).toBe(false);
    expect(ctx.band.classList.contains("pinned")).toBe(true); // pin restored
  });

  it("hovering the surface's own padding clears (nothing under the pointer)", () => {
    const ctx = setup("<p>para</p>");
    S.hoverLink.mountHoverLink({ liveView: ctx.liveView, codeView: ctx.codeView, band: ctx.band });
    ctx.liveEl.querySelector("p").dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(ctx.band.hidden).toBe(false);
    ctx.liveEl.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(ctx.band.hidden).toBe(true);
    expect(ctx.liveEl.querySelector("p").classList.contains("scribe-hover-linked")).toBe(false);
  });
});

describe("hover linking", () => {
  beforeEach(() => document.body.innerHTML === "");

  it("lineAtY converts viewport Y to a 1-based line (padding-aware)", () => {
    const { codeEl } = setup("<p>a</p>");
    const view = codeEl.ownerDocument.defaultView;
    const orig = view.getComputedStyle;
    view.getComputedStyle = () => ({ lineHeight: "16px", paddingTop: "16px" });
    expect(S.hoverLink.lineAtY(codeEl, 15)).toBe(1); // inside top padding
    expect(S.hoverLink.lineAtY(codeEl, 16)).toBe(1);
    expect(S.hoverLink.lineAtY(codeEl, 31)).toBe(1);
    expect(S.hoverLink.lineAtY(codeEl, 32)).toBe(2);
    expect(S.hoverLink.lineAtY(codeEl, 63)).toBe(3);
    view.getComputedStyle = orig;
  });

  it("bandPlacement positions the band by line range and scroll (padding-aware)", () => {
    const { codeEl } = setup("<p>a</p>");
    const view = codeEl.ownerDocument.defaultView;
    const orig = view.getComputedStyle;
    view.getComputedStyle = () => ({ lineHeight: "16px", paddingTop: "16px" });
    codeEl.scrollTop = 0;
    let p = S.hoverLink.bandPlacement(codeEl, 3, 5);
    expect(p.top).toBe(48); // 16 pad + 2*16
    expect(p.height).toBe(48);
    codeEl.scrollTop = 20;
    p = S.hoverLink.bandPlacement(codeEl, 3, 5);
    expect(p.top).toBe(28);
    view.getComputedStyle = orig;
  });

  it("hovering a Live element shows its band; leaving hides it; state untouched", () => {
    const ctx = setup("<h2>H</h2>\n<p>text</p>");
    ctx.band.className = "code-hover-band";
    S.hoverLink.mountHoverLink({ liveView: ctx.liveView, codeView: ctx.codeView, band: ctx.band });

    const h2 = ctx.liveEl.querySelector("h2");
    const before = {
      sel: ctx.codeEl.selectionStart,
      scroll: ctx.codeEl.scrollTop,
      model: ctx.model.getHTML()
    };
    h2.dispatchEvent(new win.MouseEvent("mouseover", { bubbles: true }));
    expect(h2.classList.contains("scribe-hover-linked")).toBe(true);
    expect(ctx.band.hidden).toBe(false);
    expect(ctx.band.style.height).toBe("16px"); // single-line h2

    // Non-destructive: no caret/scroll/model changes.
    expect(ctx.codeEl.selectionStart).toBe(before.sel);
    expect(ctx.codeEl.scrollTop).toBe(before.scroll);
    expect(ctx.model.getHTML()).toBe(before.model);

    h2.dispatchEvent(new win.MouseEvent("mouseout", { relatedTarget: null, bubbles: true }));
    ctx.liveEl.dispatchEvent(new win.MouseEvent("mouseleave", { bubbles: false }));
    expect(h2.classList.contains("scribe-hover-linked")).toBe(false);
    // No class="" residue after the highlight is removed.
    expect(h2.getAttribute("class")).toBe(null);
    expect(ctx.band.hidden).toBe(true);
  });

  it("hovering code lines highlights the corresponding Live element", () => {
    const ctx = setup("<p>one</p>\n<p>two</p>");
    S.hoverLink.mountHoverLink({ liveView: ctx.liveView, codeView: ctx.codeView, band: ctx.band });
    const view = ctx.codeEl.ownerDocument.defaultView;
    const orig = view.getComputedStyle;
    view.getComputedStyle = () => ({ lineHeight: "16px", paddingTop: "16px" });

    const p2 = ctx.liveEl.querySelectorAll("p")[1];
    const rect = { top: 0, height: 100 };
    ctx.codeEl.getBoundingClientRect = () => rect;
    const line2Y = 16 + 16; // padding + second line
    ctx.codeEl.dispatchEvent(
      new win.MouseEvent("mousemove", { clientY: line2Y, bubbles: true })
    );
    expect(p2.classList.contains("scribe-hover-linked")).toBe(true);

    ctx.codeEl.dispatchEvent(new win.MouseEvent("mouseleave", { bubbles: false }));
    expect(p2.classList.contains("scribe-hover-linked")).toBe(false);
    view.getComputedStyle = orig;
  });
});
