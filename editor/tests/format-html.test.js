import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Coverage for the HTML pretty-printer (block-level breaks, inline flow
// untouched, idempotent) and its integration at the model boundary
// (liveView.read()). Breaking-only-between-blocks is what makes the output
// render identically to the input; the tests pin that contract.

const win = loadScribe([
  "document-model.js",
  "cleanup.js",
  "format-html.js",
  "live-view.js"
]);
const S = win.Scribe;
const document = win.document;
const P = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return S.prettyHTML(div);
};

describe("prettyHTML — block breaks", () => {
  it("breaks and indents blocks from a one-line input (the manual-typing case)", () => {
    expect(P("<p>a</p><p>b</p><ul><li>x</li><li>y</li></ul>")).toBe(
      "<p>a</p>\n" +
      "<p>b</p>\n" +
      "<ul>\n" +
      "  <li>x</li>\n" +
      "  <li>y</li>\n" +
      "</ul>"
    );
  });

  it("nests heading + mixed containers correctly", () => {
    expect(P("<div><h2>T</h2><p>body</p></div>")).toBe(
      "<div>\n" +
      "  <h2>T</h2>\n" +
      "  <p>body</p>\n" +
      "</div>"
    );
  });

  it("breaks tables at thead/tbody/tr/cells; cell content stays inline", () => {
    expect(
      P("<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>")
    ).toBe(
      "<table>\n" +
      "  <thead>\n" +
      "    <tr>\n" +
      "      <th>A</th>\n" +
      "      <th>B</th>\n" +
      "    </tr>\n" +
      "  </thead>\n" +
      "  <tbody>\n" +
      "    <tr>\n" +
      "      <td>1</td>\n" +
      "      <td>2</td>\n" +
      "    </tr>\n" +
      "  </tbody>\n" +
      "</table>"
    );
  });

  it("puts comments on their own line", () => {
    expect(P("<p>a</p><!-- note --><p>b</p>")).toBe(
      "<p>a</p>\n" +
      "<!-- note -->\n" +
      "<p>b</p>"
    );
  });

  it("emits <hr> as a void block with no closing tag", () => {
    expect(P("<p>a</p><hr><p>b</p>")).toBe(
      "<p>a</p>\n" +
      "<hr>\n" +
      "<p>b</p>"
    );
  });

  it("emits a loose inline run in a mixed container on its own indented line", () => {
    expect(P("<div>lead<p>a</p></div>")).toBe(
      "<div>\n" +
      "  lead\n" +
      "  <p>a</p>\n" +
      "</div>"
    );
  });

  it("keeps an empty block on one line", () => {
    expect(P("<p></p>")).toBe("<p></p>");
  });
});

describe("prettyHTML — inline preservation (rendering safety)", () => {
  it("never breaks a paragraph's inline flow", () => {
    const oneLine = "<p>text <strong>b</strong> tail <em>i</em></p>";
    expect(P(oneLine)).toBe(oneLine);
  });

  it("preserves significant whitespace between inline siblings", () => {
    // The space between <strong> and <em> renders; it must survive untouched.
    expect(P("<p><b>a</b> <i>b</i></p>")).toBe("<p><b>a</b> <i>b</i></p>");
  });

  it("keeps sup/anchor runs (footnote references) on the block's line", () => {
    const html = '<p>Claim<sup id="fn1-rf"><a class="fn-lnk" href="#fn1"><span class="wb-inv">Footnote </span>1</a></sup>.</p>';
    expect(P(html)).toBe(html);
  });
});

describe("prettyHTML — idempotency", () => {
  const composite = [
    "<h2>Section</h2>",
    "<p>Intro with <strong>bold</strong> and <em>italic</em>.</p>",
    "<ul><li>one</li><li>two</li></ul>",
    "<table><thead><tr><th colspan=\"2\">H</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
    "<!-- a comment -->",
    "<figure class=\"img-placeholder\">[IMAGE: x]</figure>",
    "<div>lead<p>a</p></div>"
  ].join("");

  it("format(format(x)) === format(x) for a composite document", () => {
    const once = P(composite);
    const twice = P(once);
    expect(twice).toBe(once);
  });

  it("does not grow whitespace across repeated round-trips", () => {
    let out = P(composite);
    for (let i = 0; i < 5; i++) out = P(out);
    expect(out.length).toBe(P(composite).length);
  });
});

describe("Integration: liveView.read() formats at the model boundary", () => {
  it("manually-entered multi-block content reads back readable (the reported bug)", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const model = new S.DocumentModel("");
    const lv = S.createLiveView(el, model, { ChangeSource: S.ChangeSource });

    el.innerHTML = "<p>a</p><p>b</p><ul><li>x</li></ul>"; // one line
    expect(lv.read()).toBe(
      "<p>a</p>\n<p>b</p>\n<ul>\n  <li>x</li>\n</ul>"
    );
  });

  it("read() output round-trips stably through the model", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const model = new S.DocumentModel("");
    const lv = S.createLiveView(el, model, { ChangeSource: S.ChangeSource });

    el.innerHTML = "<div><h2>T</h2><p>body <strong>b</strong></p></div>";
    model.setHTML(lv.read(), S.ChangeSource.live);
    const first = model.getHTML();
    // Re-render from the model, edit nothing, read again -> identical.
    el.innerHTML = first;
    model.setHTML(lv.read(), S.ChangeSource.live);
    expect(model.getHTML()).toBe(first);
  });

  it("Copy output (serializeForOutput over the pretty model) stays readable", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const model = new S.DocumentModel("");
    const lv = S.createLiveView(el, model, { ChangeSource: S.ChangeSource });

    el.innerHTML =
      '<p>Intro</p><figure class="img-placeholder" data-img-alt="Chart">[IMAGE: Chart]</figure><p>Outro</p>';
    model.setHTML(lv.read(), S.ChangeSource.live);

    const copy = S.serializeForOutput(model.getHTML());
    // Placeholders still become comments, and the output is multi-line.
    expect(copy).toContain("<!-- image: Chart -->");
    expect(copy).not.toContain("img-placeholder");
    expect(copy.split("\n").length).toBeGreaterThan(1);
    expect(copy).toContain("<p>Intro</p>");
  });
});
