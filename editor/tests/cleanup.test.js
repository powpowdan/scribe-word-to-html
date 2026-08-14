import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Classic-script editor: load cleanup.js into a happy-dom window and pull the
// functions off the shared window.Scribe namespace.
const win = loadScribe(["cleanup.js"]);
const {
  sanitizeWordHtml,
  cleanWordHtml,
  serializeForOutput,
  extractFragment,
  plainTextToHtml
} = win.Scribe;

// These snapshots lock the behavior of the cleanup pipeline as captured at
// extraction time (the moment sanitizeWordHtml and friends were moved verbatim
// out of the legacy word-to-html.html IIFE). Any later change that alters
// observable output will fail here. Update a snapshot only after confirming the
// new behavior is intended and the spec (image-placeholders, dual-view-editor)
// still holds.

describe("extractFragment / plainTextToHtml", () => {
  it("extracts the Word fragment body", () => {
    const html =
      "<!--StartFragment--><p>Hello</p><!--EndFragment-->";
    expect(extractFragment(html)).toBe("<p>Hello</p>");
  });

  it("returns input unchanged when no fragment markers", () => {
    const html = "<p>No markers</p>";
    expect(extractFragment(html)).toBe("<p>No markers</p>");
  });

  it("wraps plain-text lines as paragraphs", () => {
    expect(plainTextToHtml("alpha\n\nbeta\ngamma")).toBe(
      "<p>alpha</p><p>beta</p><p>gamma</p>"
    );
  });
});

describe("sanitizeWordHtml", () => {
  it("strips MSO and presentation attributes", () => {
    const html =
      '<p class="MsoNormal" style="mso-pagination:widow-orphan" align="center" lang="en-CA">Body</p>';
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>Body</p>"`);
  });

  // NOTE: real browsers parse <o:p> as an element whose tagName contains ":" and
  // the unwrap fires on the indexOf(":") check. happy-dom parses <o:p> as <o>,
  // so the namespaced-tag path can't be exercised here. We instead cover the
  // same unwrap branch (tag === "script"|"style"|"meta"|"link") which happy-dom
  // parses correctly. The o:p behavior is validated manually in the browser
  // (task 1.16 acceptance).
  it("unwraps special tags (script, style, meta, link)", () => {
    const html = "<p>before</p><script>alert(1)</script><style>x{}</style><p>after</p>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>before</p>alert(1)x{}<p>after</p>"`);
  });

  it("converts b/i to strong/em", () => {
    const html = "<p><b>bold</b> and <i>italic</i></p>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p><strong>bold</strong> and <em>italic</em></p>"`);
  });

  it("converts a text-only div into a paragraph", () => {
    const html = "<div>just text</div>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>just text</p>"`);
  });

  it("unwraps a div that contains block-level children", () => {
    const html = "<div><p>one</p><p>two</p></div>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>one</p><p>two</p>"`);
  });

  it("removes empty paragraphs and spans", () => {
    const html = "<p>kept</p><p></p><span> </span><p>also kept</p>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>kept</p> <p>also kept</p>"`);
  });

  it("removes Word-internal _Toc anchors that have no text", () => {
    const html = '<a name="_Toc12345"></a><p>Body</p>';
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>Body</p>"`);
  });

  it("collapses consecutive br tags", () => {
    const html = "<p>a<br><br>b</p>";
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>ab</p>"`);
  });

  it("removes data-* attributes", () => {
    const html = '<p data-foo="bar" data-id="9">text</p>';
    expect(sanitizeWordHtml(html)).toMatchInlineSnapshot(`"<p>text</p>"`);
  });
});

describe("cleanWordHtml (full pipeline)", () => {
  it("normalizes bullet markers into a <ul>", () => {
    const html =
      "<p>* alpha</p><p>* beta</p><p>plain paragraph</p>";
    const result = cleanWordHtml(html);
    expect(result.html).toMatchInlineSnapshot(`"<ul><li>alpha</li><li>beta</li></ul><p>plain paragraph</p>"`);
    expect(result.warnings).toEqual([]);
  });

  it("normalizes numbered markers into an <ol>", () => {
    const html = "<p>1. first</p><p>2. second</p>";
    expect(cleanWordHtml(html).html).toMatchInlineSnapshot(`"<ol><li>first</li><li>second</li></ol>"`);
  });

  it("replaces images with a visible placeholder figure and warns", () => {
    // img shares a paragraph with text so it survives sanitize's empty-p cleanup
    const html = '<p>Before <img src="x/chart.png" alt="Chart of results"> After</p>';
    const result = cleanWordHtml(html);
    expect(result.html).toMatchInlineSnapshot(`"<p>Before <figure class="img-placeholder" data-img-alt="Chart of results">[IMAGE: Chart of results]</figure> After</p>"`);
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        "1 image replaced with a placeholder — handle separately.",
      ]
    `);
  });

  it("replaces images without alt with a generic label", () => {
    const html = '<p>Text <img src="photo.jpeg"> more</p>';
    expect(cleanWordHtml(html).html).toMatchInlineSnapshot(`"<p>Text <figure class="img-placeholder" data-img-alt="photo.jpeg">[IMAGE: photo.jpeg]</figure> more</p>"`);
  });

  it("accepts tracked changes (removes del, unwraps ins)", () => {
    const html = '<p>keep <del>old</del><ins>new</ins> text</p>';
    const result = cleanWordHtml(html);
    expect(result.html).toMatchInlineSnapshot(`"<p>keep new text</p>"`);
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        "Tracked changes detected and accepted (2 changes).",
      ]
    `);
  });

  it("flattens a nested table and warns", () => {
    const html =
      '<table><tbody><tr><td>cell<p>nested:</p><table><tbody><tr><td>inner</td></tr></tbody></table></td></tr></tbody></table>';
    const result = cleanWordHtml(html);
    expect(result.html).toMatchInlineSnapshot(`"<table><tbody><tr><td>cell<p>nested:</p><p><!--nested table flattened--></p><p>inner</p></td></tr></tbody></table>"`);
    expect(result.warnings).toMatchInlineSnapshot(`
      [
        "1 nested table flattened with comment marker.",
      ]
    `);
  });

  it("runs the full pipeline over a representative Word fragment", () => {
    const html =
      '<p class="MsoNormal" style="mso-pagination:widow-orphan">Title</p>' +
      '<p class="MsoNormal"><b>Bold</b> run with <i>italic</i> and <o:p></o:p>office marker</p>' +
      '<p class="MsoNormal">* item one<br>* item two</p>';
    expect(cleanWordHtml(html).html).toMatchInlineSnapshot(`"<p>Title</p><p><strong>Bold</strong> run with <em>italic</em> and <o></o:p>office marker<p>* item one* item two</p></o></p>"`);
  });
});

describe("serializeForOutput (image-placeholder -> comment)", () => {
  it("converts an image placeholder into an HTML comment on output", () => {
    const html =
      '<p>Before</p><figure class="img-placeholder" data-img-alt="Chart of results">[IMAGE: Chart of results]</figure><p>After</p>';
    expect(serializeForOutput(html)).toMatchInlineSnapshot(`"<p>Before</p><!-- image: Chart of results --><p>After</p>"`);
  });

  it("falls back to a generic label when data-img-alt is missing", () => {
    const html =
      '<figure class="img-placeholder">[IMAGE: image]</figure>';
    expect(serializeForOutput(html)).toMatchInlineSnapshot(`"<!-- image: image -->"`);
  });

  it("recursively strips empty elements but preserves empty table cells", () => {
    const html =
      '<p>kept</p><p></p><span> </span><table><tbody><tr><td></td><td>data</td></tr></tbody></table>';
    expect(serializeForOutput(html)).toMatchInlineSnapshot(`"<p>kept</p><div class="table-responsive"><table><tbody><tr><td></td><td>data</td></tr></tbody></table></div>"`);
  });
});

describe("ensureTableResponsive (WET wrapper guarantee)", () => {
  it("wraps an unwrapped table", () => {
    const div = document.createElement("div");
    div.innerHTML = "<table><tbody><tr><td>x</td></tr></tbody></table>";
    win.Scribe.ensureTableResponsive(div);
    const wrap = div.querySelector(".table-responsive");
    expect(wrap).not.toBe(null);
    expect(wrap.querySelector("table")).not.toBe(null);
    expect(wrap.parentElement).toBe(div);
  });

  it("leaves already-wrapped tables untouched (idempotent)", () => {
    const div = document.createElement("div");
    div.innerHTML = '<div class="table-responsive"><table><tbody><tr><td>x</td></tr></tbody></table></div>';
    win.Scribe.ensureTableResponsive(div);
    expect(div.querySelectorAll(".table-responsive").length).toBe(1);
    expect(div.firstElementChild.className).toBe("table-responsive");
  });

  it("wraps multiple tables independently", () => {
    const div = document.createElement("div");
    div.innerHTML = "<table><tbody><tr><td>1</td></tr></tbody></table><p>mid</p><table><tbody><tr><td>2</td></tr></tbody></table>";
    win.Scribe.ensureTableResponsive(div);
    expect(div.querySelectorAll(".table-responsive").length).toBe(2);
    expect(div.querySelectorAll("table").length).toBe(2);
    // Document order preserved: p between the two wrappers.
    const wrappers = div.querySelectorAll(".table-responsive");
    expect(wrappers[0].nextElementSibling.tagName).toBe("P");
  });

  it("serializeForOutput (Copy) guarantees the wrapper", () => {
    const out = win.Scribe.serializeForOutput("<table><tbody><tr><td>x</td></tr></tbody></table>");
    expect(out).toContain("table-responsive");
    expect(out.indexOf("table-responsive")).toBeLessThan(out.indexOf("<table"));
  });
});
