import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Pure-logic coverage for the document report panel (outline / counts /
// issues). The mounter + click-to-jump navigation are browser-verified.

const win = loadScribe(["qa-panel.js"]);
const Q = win.Scribe.qaPanel;
const document = win.document;

function rootWith(html) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  return root;
}

describe("buildOutline", () => {
  it("lists real headings with level/id/text in document order, indexed for position nav", () => {
    const root = rootWith(
      '<h1 id="a">Title</h1><h2 id="b">Section</h2><h3>Sub</h3>'
    );
    expect(Q.buildOutline(root)).toEqual([
      { level: 1, id: "a", text: "Title", index: 0 },
      { level: 2, id: "b", text: "Section", index: 1 },
      { level: 3, id: null, text: "Sub", index: 2 }
    ]);
  });

  it("excludes headings inside a generated ToC nav (gc-toc + legacy)", () => {
    const root = rootWith(
      '<nav class="gc-toc"><h2>On this page</h2><ul><li><a href="#x">x</a></li></ul></nav>' +
        '<nav class="on-this-page"><h2>Old block</h2></nav>' +
        '<h2 id="x">Real section</h2>'
    );
    const outline = Q.buildOutline(root);
    expect(outline.length).toBe(1);
    expect(outline[0].text).toBe("Real section");
    expect(outline[0].index).toBe(0);
  });
});

describe("countSelectors", () => {
  it("counts tags, classes, and compound selectors", () => {
    const root = rootWith(
      '<h2>a</h2><h2>b</h2><p class="alert">x</p><a href="#">link</a>'
    );
    const r = Q.countSelectors(root, ["h2", ".alert", "p.alert", "a"]);
    expect(r).toEqual([
      { selector: "h2", count: 2 },
      { selector: ".alert", count: 1 },
      { selector: "p.alert", count: 1 },
      { selector: "a", count: 1 }
    ]);
  });

  it("reports invalid selectors instead of throwing", () => {
    const root = rootWith("<p>x</p>");
    const r = Q.countSelectors(root, ["p", "!!![", ""]);
    expect(r[0]).toEqual({ selector: "p", count: 1 });
    expect(r[1].error).toBe(true);
    expect(r[1].count).toBe(0);
    expect(r[2].empty).toBe(true);
  });
});

describe("detectIssues", () => {
  it("flags a skipped heading level", () => {
    const root = rootWith('<h2 id="a">A</h2><h4 id="b">B</h4>');
    const types = Q.detectIssues(root).map((i) => i.type);
    expect(types).toContain("skipped-level");
  });

  it("flags headings without an id, with a position locator", () => {
    const root = rootWith("<h2>no id</h2>");
    const issues = Q.detectIssues(root).filter((i) => i.type === "heading-no-id");
    expect(issues.length).toBe(1);
    expect(issues[0].locator).toEqual({ kind: "heading", index: 0 });
  });

  it("flags a table without an id", () => {
    const root = rootWith('<table id="t1"><tbody><tr><td>1</td></tr></tbody></table><table><tbody><tr><td>2</td></tr></tbody></table>');
    const issues = Q.detectIssues(root).filter((i) => i.type === "table-no-id");
    expect(issues.length).toBe(1);
    // Locator points at the second table (position-based, clickable).
    expect(issues[0].locator).toEqual({ kind: "table", index: 1 });
  });

  it("flags leftover image placeholders", () => {
    const root = rootWith('<figure class="img-placeholder" data-img-alt="x">[IMAGE: x]</figure>');
    expect(Q.detectIssues(root).some((i) => i.type === "image-placeholder")).toBe(true);
  });

  it("flags links with empty or placeholder href", () => {
    const root = rootWith('<a href="">empty</a><a href="#">hash</a><a href="https://ok">ok</a>');
    const issues = Q.detectIssues(root).filter((i) => i.type === "bad-link");
    expect(issues.length).toBe(2); // empty + hash, not the ok one
  });

  it("flags an empty heading", () => {
    const root = rootWith("<h2></h2>");
    expect(Q.detectIssues(root).some((i) => i.type === "empty-heading")).toBe(true);
  });

  it("returns no issues for a clean, well-structured document", () => {
    const root = rootWith(
      '<h1 id="t">Title</h1><h2 id="a">A</h2><h3 id="a1">A1</h3><h2 id="b">B</h2>'
    );
    expect(Q.detectIssues(root)).toEqual([]);
  });
});

  it("a named anchor without href is a bookmark, not a bad-link issue", () => {
    const root = rootWith('<p>x<a name="_bookmark"></a></p><a href="#">real</a>');
    const issues = Q.detectIssues(root).filter((i) => i.type === "bad-link");
    expect(issues.length).toBe(1); // only the href="#" link
    expect(issues[0].message).toContain("real");
  });
