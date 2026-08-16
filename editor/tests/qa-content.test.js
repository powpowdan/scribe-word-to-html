import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Content-review detection (qa-content-review-checks): broken internal
// anchors (incl. stale gc-toc entries), duplicate ids, table captions,
// per-placeholder image rows, drafting markers, and weak link text.

const win = loadScribe(["qa-panel.js"]);
const Q = win.Scribe.qaPanel;
const document = win.document;

function rootWith(html) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  return root;
}

function issuesIn(html) {
  return Q.detectIssues(rootWith(html));
}

describe("broken internal anchors", () => {
  it("flags a link whose target id does not exist", () => {
    const issues = issuesIn('<h2 id="sec">S</h2><p><a href="#gone">x</a></p>');
    const broken = issues.filter((i) => i.type === "broken-anchor");
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toContain("#gone");
    expect(broken[0].locator).toEqual({ kind: "link", index: 0 });
  });

  it("does not flag a resolvable internal link", () => {
    const types = issuesIn('<h2 id="sec">S</h2><p><a href="#sec">x</a></p>').map((i) => i.type);
    expect(types).not.toContain("broken-anchor");
  });

  it("flags a stale On-this-page (gc-toc) entry", () => {
    const html =
      '<nav class="gc-toc"><h2>On this page</h2><ul><li><a href="#removed">Gone</a></li></ul></nav>' +
      "<h2 id=\"real\">Real</h2>";
    const broken = issuesIn(html).filter((i) => i.type === "broken-anchor");
    expect(broken).toHaveLength(1);
    expect(broken[0].message).toContain("Gone");
  });

  it("never checks external or relative hrefs", () => {
    const types = issuesIn('<p><a href="https://x.example#a">x</a> <a href="page.html#frag">y</a></p>').map((i) => i.type);
    expect(types).not.toContain("broken-anchor");
  });

  it("reports href=\"#\" once as bad-link, not as a broken anchor", () => {
    const issues = issuesIn('<p><a href="#">dead</a></p>');
    expect(issues.filter((i) => i.type === "bad-link")).toHaveLength(1);
    expect(issues.filter((i) => i.type === "broken-anchor")).toHaveLength(0);
  });
});

describe("duplicate ids", () => {
  it("flags elements sharing an id, once per extra element, navigable by id", () => {
    const issues = issuesIn('<p id="a">1</p><p id="a">2</p>').filter((i) => i.type === "duplicate-id");
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe("a");
    expect(issues[0].message).toContain('"a"');
  });

  it("does not flag unique ids", () => {
    const types = issuesIn('<p id="a">1</p><p id="b">2</p>').map((i) => i.type);
    expect(types).not.toContain("duplicate-id");
  });
});

describe("table captions", () => {
  it("flags a table with no caption", () => {
    const issues = issuesIn("<table><tr><td>a</td></tr></table>").filter((i) => i.type === "table-no-caption");
    expect(issues).toHaveLength(1);
  });

  it("flags a table with an empty caption", () => {
    const issues = issuesIn("<table><caption>  </caption><tr><td>a</td></tr></table>").filter((i) => i.type === "table-no-caption");
    expect(issues).toHaveLength(1);
  });

  it("does not flag a table with caption text", () => {
    const types = issuesIn('<table id="t"><caption>Results</caption><tr><td>a</td></tr></table>').map((i) => i.type);
    expect(types).not.toContain("table-no-caption");
  });

  it("reports a caption issue alongside a missing-id issue on the same table", () => {
    const types = issuesIn("<table><caption>R</caption><tr><td>a</td></tr></table>").map((i) => i.type);
    expect(types).toContain("table-no-id");
    expect(types).not.toContain("table-no-caption");
    const both = issuesIn("<table><tr><td>a</td></tr></table>").map((i) => i.type);
    expect(both).toContain("table-no-id");
    expect(both).toContain("table-no-caption");
  });
});

describe("per-placeholder image rows", () => {
  it("emits one navigable issue per placeholder", () => {
    const html =
      '<figure class="img-placeholder" data-img-alt="a">[IMAGE: a]</figure>' +
      '<p>between</p>' +
      '<figure class="img-placeholder" data-img-alt="b">[IMAGE: b]</figure>' +
      '<figure class="img-placeholder" data-img-alt="c">[IMAGE: c]</figure>';
    const issues = issuesIn(html).filter((i) => i.type === "image-placeholder");
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.locator)).toEqual([
      { kind: "placeholder", index: 0 },
      { kind: "placeholder", index: 1 },
      { kind: "placeholder", index: 2 }
    ]);
    expect(issues[1].message).toContain('"b"');
  });
});

describe("prose markers", () => {
  it("flags drafting markers as whole words, case-insensitively", () => {
    expect(issuesIn("<p>TODO: write this</p>").some((i) => i.type === "prose-marker")).toBe(true);
    expect(issuesIn("<p>Add TBD items</p>").some((i) => i.type === "prose-marker")).toBe(true);
    expect(issuesIn("<p>Fix the lorem ipsum draft</p>").some((i) => i.type === "prose-marker")).toBe(true);
  });

  it("catches markers split across inline formatting, with a block locator", () => {
    const issues = issuesIn("<h2 id=\"s\">Plan</h2><p>Replace <strong>lorem ipsum</strong> later</p>").filter((i) => i.type === "prose-marker");
    expect(issues).toHaveLength(1);
    expect(issues[0].locator).toEqual({ kind: "block", index: 1 });
  });

  it("reports a nested marker once, on the outer block", () => {
    const issues = issuesIn("<ul><li><p>TODO nested</p></li></ul>").filter((i) => i.type === "prose-marker");
    expect(issues).toHaveLength(1);
  });

  it("does not flag coincidental substrings", () => {
    const types = issuesIn("<p>Todorov visited Toronto and played xylophone music</p>").map((i) => i.type);
    expect(types).not.toContain("prose-marker");
  });
});

describe("weak link text", () => {
  it("flags click here / cliquez ici as link text, ignoring case and punctuation", () => {
    const html = '<p><a href="https://x">Click here.</a> <a href="https://y">CLIQUEZ ICI</a></p>';
    const weak = issuesIn(html).filter((i) => i.type === "weak-link-text");
    expect(weak).toHaveLength(2);
    expect(weak[0].locator).toEqual({ kind: "link", index: 0 });
  });

  it("does not flag the phrase in plain text or informative link text", () => {
    const html = '<p id="t">Click here for details about <a href="https://x">eligibility criteria</a>.</p>';
    const types = issuesIn(html).map((i) => i.type);
    expect(types).not.toContain("weak-link-text");
  });
});

describe("clean document regression", () => {
  it("reports no issues for a clean document under the expanded detection set", () => {
    const html =
      '<h1 id="t">Title</h1>' +
      '<h2 id="a">A</h2>' +
      '<p>Real content with <a href="#a">an internal link</a> and <a href="https://x.example">informative text</a>.</p>' +
      '<table id="tbl-1"><caption>Results</caption><tr><td>1</td></tr></table>';
    expect(Q.detectIssues(rootWith(html))).toEqual([]);
  });
});
