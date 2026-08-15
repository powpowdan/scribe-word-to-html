import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// Source-map tests (view-linking spec): the map must be EXACT against the
// canonical serialization — golden offsets — and byte-identical to what
// liveView.read() produces for the same tree (normalization parity). The
// fallback matcher must find the right occurrence or admit defeat (null),
// never a confident wrong jump.

const win = loadScribe([
  "document-model.js",
  "cleanup.js",
  "format-html.js",
  "source-map.js",
  "code-view.js",
  "live-view.js",
  "sync.js"
]);
const S = win.Scribe;
const document = win.document;
const { DocumentModel, ChangeSource, createLiveView, buildSourceMap } = S;

function mountLive(html) {
  const el = document.createElement("div");
  el.contentEditable = "true";
  document.body.appendChild(el);
  const model = new DocumentModel("");
  const lv = createLiveView(el, model, { ChangeSource });
  el.innerHTML = html;
  return { el, model, lv };
}

const COMPOSITE =
  "<h2>Section</h2>" +
  "<p>Intro with <strong>bold</strong> and <em>italic</em>.</p>" +
  "<ul><li>one</li><li>two</li></ul>" +
  "<table><thead><tr><th colspan=\"2\">H</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>" +
  "<!-- image: chart.png -->" +
  '<figure class="img-placeholder">[IMAGE: x]</figure>' +
  "<p>A &amp; B &mdash; entities</p>";

describe("buildSourceMap — golden offsets", () => {
  let ctx, map;

  beforeEach(() => {
    document.body.innerHTML = "";
    ctx = mountLive(COMPOSITE);
    map = buildSourceMap(ctx.el);
  });

  it("html is byte-identical to liveView.read() (normalization parity)", () => {
    expect(map.html).toBe(ctx.lv.read());
  });

  it("serialization is idempotent and the map matches its own output", () => {
    // Re-reading the rendered canonical html reproduces the same text.
    ctx.el.innerHTML = map.html;
    const map2 = buildSourceMap(ctx.el);
    expect(map2.html).toBe(map.html);
  });

  it("every element entry range points at its exact opening tag in map.html", () => {
    for (const e of map.entries) {
      if (e.kind !== "element") continue;
      expect(map.html.slice(e.start, e.end)).toBe("<" + e.tag + map.html.slice(e.start + 1 + e.tag.length, e.end));
      expect(map.html.startsWith("<" + e.tag, e.start)).toBe(true);
      expect(map.html.charAt(e.end - 1)).toBe(">");
      if (e.closeStart !== null) {
        expect(map.html.startsWith("</" + e.tag, e.closeStart)).toBe(true);
      }
    }
  });

  it("records exact ranges for tables, cells, figures and comments", () => {
    const h2 = map.entries.find((e) => e.tag === "h2");
    expect(map.html.slice(h2.start, h2.fullEnd)).toBe("<h2>Section</h2>");
    expect(h2.line).toBe(1);

    const td = map.entries.find((e) => e.tag === "td");
    expect(map.html.slice(td.start, td.fullEnd)).toBe("<td>1</td>");

    const th = map.entries.find((e) => e.tag === "th");
    expect(map.html.slice(th.start, th.end)).toBe('<th colspan="2">');

    const fig = map.entries.find((e) => e.tag === "figure");
    expect(map.html.slice(fig.start, fig.fullEnd)).toBe(
      '<figure class="img-placeholder">[IMAGE: x]</figure>'
    );

    const comment = map.entries.find((e) => e.kind === "comment");
    expect(map.html.slice(comment.start, comment.end)).toBe("<!-- image: chart.png -->");
  });

  it("maps an inline-formatted paragraph to a single line containing its text", () => {
    const p = map.entries.find((e) => e.tag === "p" && map.html.slice(e.start, e.fullEnd).includes("bold"));
    expect(p.line).toBe(p.endLine);
    const line = map.html.split("\n")[p.line - 1];
    expect(line).toBe("<p>Intro with <strong>bold</strong> and <em>italic</em>.</p>");
  });

  it("closeStart is null only for void elements", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    el.innerHTML = "<p>a</p><hr>";
    const m = buildSourceMap(el);
    const hr = m.entries.find((e) => e.tag === "hr");
    const p = m.entries.find((e) => e.tag === "p");
    expect(hr.closeStart).toBe(null);
    expect(hr.fullEnd).toBe(hr.end);
    expect(p.closeStart).not.toBe(null);
  });
});

describe("buildSourceMap — normalization parity details", () => {
  beforeEach(() => document.body.innerHTML = "");

  it("b/i normalization and table wrappers are reflected exactly like read()", () => {
    const { el, lv } = mountLive("<p><b>bold</b> and <i>it</i></p><table><tbody><tr><td>x</td></tr></tbody></table>");
    const map = buildSourceMap(el);
    expect(map.html).toBe(lv.read());
    expect(map.html).toContain("<strong>bold</strong>");
    expect(map.html).toContain('<div class="table-responsive">');
    // The wrapper exists in the map; the table lives inside it (path len +1).
    const wrapper = map.entries.find((e) => e.tag === "div");
    const table = map.entries.find((e) => e.tag === "table");
    expect(wrapper.fullEnd).toBeGreaterThan(table.start);
    expect(table.path.length).toBe(wrapper.path.length + 1);
  });

  it(".selected/.hovered editor state is stripped in the map output", () => {
    const { el } = mountLive('<table><tbody><tr><td class="selected">a</td></tr></tbody></table>');
    const map = buildSourceMap(el);
    expect(map.html).not.toContain("selected");
  });

  it("empty class attributes never leak into the canonical output", () => {
    // Post-hover reality: elements carry class="" after highlight classes are
    // removed; read() and the map must both drop the attribute entirely.
    const { el, lv } = mountLive('<p class="">a</p><table><tbody><tr><td class="hovered">b</td></tr></tbody></table>');
    const map = buildSourceMap(el);
    expect(map.html).not.toContain('class=""');
    expect(map.html).toBe(lv.read());
    expect(map.html).toContain("<p>a</p>");
  });

  it("hover/flash highlight classes never reach the canonical output", () => {
    // Continuous sync commits while a hover highlight or reveal flash is on
    // the element — read() and the map must strip both classes.
    const { el, lv } = mountLive(
      '<h2 class="scribe-hover-linked">T</h2><p class="scribe-flash">body</p><p class="scribe-flash selected">sel</p>'
    );
    const map = buildSourceMap(el);
    expect(map.html).not.toContain("scribe-hover-linked");
    expect(map.html).not.toContain("scribe-flash");
    expect(map.html).toBe(lv.read());
    expect(map.html).toContain("<h2>T</h2>");
    expect(map.html).toContain("<p>body</p>");
  });

  it("legit classes survive the editor-state scrub", () => {
    const { el } = mountLive('<p class="mrgn-lft-md">indented</p><ul class="list-unstyled"><li>x</li></ul>');
    const map = buildSourceMap(el);
    expect(map.html).toContain('class="mrgn-lft-md"');
    expect(map.html).toContain('class="list-unstyled"');
  });

  it("already-wrapped tables are not double-wrapped", () => {
    const { el } = mountLive('<div class="table-responsive"><table><tbody><tr><td>a</td></tr></tbody></table></div>');
    const map = buildSourceMap(el);
    expect(map.html.match(/table-responsive/g).length).toBe(1);
  });
});

describe("block paths — live tree round trip", () => {
  beforeEach(() => document.body.innerHTML = "");

  it("rangeForElement finds unwrapped live tables (wrapper rule)", () => {
    const { el } = mountLive("<h2>T</h2><p>x</p><table><tbody><tr><td>c</td></tr></tbody></table>");
    const map = buildSourceMap(el);
    // Live tree has no wrapper (fresh innerHTML) — the path rule must compensate.
    const table = el.querySelector("table");
    const r = map.rangeForElement(table);
    expect(r).not.toBe(null);
    expect(map.html.slice(r.start, r.end)).toBe("<table>");
    const td = el.querySelector("td");
    const r2 = map.rangeForElement(td);
    expect(map.html.slice(r2.start, r2.fullEnd)).toBe("<td>c</td>");
  });

  it("resolve() maps code entries back onto live elements (incl. nested tables)", () => {
    const { el } = mountLive(
      "<table><tbody><tr><td>outer<table><tbody><tr><td>inner</td></tr></tbody></table></td></tr></tbody></table>"
    );
    const map = buildSourceMap(el);
    const tds = map.entries.filter((e) => e.tag === "td" && e.path);
    expect(tds.length).toBe(2);
    for (const td of tds) {
      const liveEl = map.resolve(td.path);
      expect(liveEl).not.toBe(null);
      expect(liveEl.nodeName).toBe("TD");
      expect(map.rangeForElement(liveEl)).toBe(td);
    }
  });

  it("entryForOffset returns the innermost containing element", () => {
    const { el } = mountLive("<p>one</p><table><tbody><tr><td>cell</td></tr></tbody></table>");
    const map = buildSourceMap(el);
    const td = map.entries.find((e) => e.tag === "td");
    // Caret inside the cell's content.
    const inner = map.entryForOffset(td.start + 4);
    expect(inner.tag).toBe("td");
    // Offset in a root-level comment targets the nearest following element.
    const c2 = document.createElement("div");
    document.body.appendChild(c2);
    c2.innerHTML = "<!-- lead comment --><p>x</p>";
    const mapC = buildSourceMap(c2);
    const inComment = mapC.html.indexOf("lead");
    const following = mapC.entryForOffset(inComment);
    expect(following.following).toBe(true);
    expect(following.tag).toBe("p");
    // Past the end: null.
    expect(map.entryForOffset(map.html.length + 10)).toBe(null);
  });
});

describe("isCanonical / tidyHtml", () => {
  beforeEach(() => document.body.innerHTML = "");

  it("canonical serializer output is canonical; hand-shaped text is not", () => {
    const { el } = mountLive(COMPOSITE);
    const html = buildSourceMap(el).html;
    expect(S.isCanonical(html)).toBe(true);
    expect(S.tidyHtml(html)).toBe(html); // idempotent, byte-identical
    expect(S.isCanonical("<p>a</p>  <p>b</p>")).toBe(false);
    expect(S.isCanonical("<div><p>a</p></div>")).toBe(false); // wrapper line differs
    expect(S.tidyHtml("<p>a</p><hr><ul><li>x</li></ul>")).toBe(
      "<p>a</p>\n<hr>\n<ul>\n  <li>x</li>\n</ul>"
    );
  });
});

describe("fallbackRange — best-effort matching, never wrong-jump", () => {
  beforeEach(() => document.body.innerHTML = "");

  it("finds the sole occurrence of a distinctive opening tag", () => {
    const { el } = mountLive('<h2 id="foo">T</h2>');
    const map = buildSourceMap(el);
    const handEdited = map.html.replace("<h2", "  <h2"); // leading whitespace edit
    const h2 = el.querySelector("h2");
    const r = S.fallbackRange(handEdited, el, h2);
    expect(r).not.toBe(null);
    expect(handEdited.slice(r.start, r.end)).toBe('<h2 id="foo">');
  });

  it("disambiguates duplicates by document-order ordinal", () => {
    const { el } = mountLive("<p>one</p><p>two</p><p>three</p>");
    const ps = el.querySelectorAll("p");
    const map = buildSourceMap(el);
    // Hand-edited: everything on one line.
    const text = "<p>one</p> <p>two</p> <p>three</p>";
    const r2 = S.fallbackRange(text, el, ps[2]);
    expect(text.slice(r2.start, r2.end)).toBe("<p>");
    expect(text.slice(r2.start, r2.start + 12)).toBe("<p>three</p>");
    const r0 = S.fallbackRange(text, el, ps[0]);
    expect(r0.start).toBe(0);
  });

  it("strips editor-only classes before matching", () => {
    const { el } = mountLive('<table><tbody><tr><td class="selected">a</td><td>b</td></tr></tbody></table>');
    const td = el.querySelector("td.selected");
    const map = buildSourceMap(el);
    const r = S.fallbackRange(map.html, el, td);
    expect(r).not.toBe(null);
    // The canonical output drops the class attribute entirely; the match
    // must land on the FIRST td (the selected one), not the second.
    expect(r.start).toBe(map.html.indexOf("<td>"));
    expect(map.html.slice(r.start, r.start + 5)).toBe("<td>a");
  });

  it("returns null when the tag is absent or the ordinal exceeds occurrences", () => {
    const { el } = mountLive("<p>one</p><p>two</p>");
    const ps = el.querySelectorAll("p");
    expect(S.fallbackRange("<p>only</p>", el, ps[1])).toBe(null);
    expect(S.fallbackRange("<div>gone</div>", el, ps[0])).toBe(null);
    expect(S.fallbackRange("<p>a</p>", el, el)).toBe(null); // root is not an element below root
  });

  it("entryForCodeOffset maps a caret in hand-edited text via unique line text", () => {
    const { el } = mountLive("<h2>Unique heading</h2><p>body</p>");
    const map = buildSourceMap(el);
    const hand = "junk\n    <h2>Unique heading</h2>\n  <p>body</p>";
    const caretInHeading = hand.indexOf("Unique") + 3;
    const entry = map.entryForCodeOffset(hand, caretInHeading);
    expect(entry).not.toBe(null);
    expect(entry.tag).toBe("h2");
    // A duplicated, ambiguous line admits defeat.
    const dup = "<p>x</p>\n  <p>x</p>";
    const map2 = (() => {
      const el2 = document.createElement("div");
      document.body.appendChild(el2);
      el2.innerHTML = "<p>x</p><p>x</p>";
      return buildSourceMap(el2);
    })();
    const inSecond = dup.indexOf("x", dup.indexOf("x") + 1);
    expect(map2.entryForCodeOffset(dup, inSecond)).toBe(null);
  });
});

describe("viewport helpers", () => {
  it("pickTopAnchor picks the first block crossing the viewport top", () => {
    const entries = [
      { el: "a", top: -100, bottom: -50 },
      { el: "b", top: -50, bottom: 30 },
      { el: "c", top: 30, bottom: 100 }
    ];
    expect(S.pickTopAnchor(entries, 0).el).toBe("b");
    expect(S.pickTopAnchor(entries, 40).el).toBe("c");
    expect(S.pickTopAnchor([], 0)).toBe(null);
  });

  it("innermostBlockFrom walks up to the nearest block", () => {
    const { el } = mountLive("<p>one <strong>two</strong></p>");
    const strong = el.querySelector("strong");
    expect(S.innermostBlockFrom(strong, el)).toBe(el.querySelector("p"));
    expect(S.innermostBlockFrom(el, el)).toBe(null);
  });
});
