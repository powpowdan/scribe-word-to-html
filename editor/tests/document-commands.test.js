import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Headless coverage for the document-structure commands (Add IDs, On this
// page). Pure DOM operations on a root element.

const win = loadScribe(["document-commands.js"]);
const S = win.Scribe.documentCommands;
const document = win.document;

function rootWith(html) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  return root;
}

describe("slugify", () => {
  it("lowercases, hyphenates non-alphanumeric runs, trims", () => {
    expect(S.slugify("Funding Results")).toBe("funding-results");
    expect(S.slugify("  Q1 / 2024!  ")).toBe("q1-2024");
    expect(S.slugify("A — B")).toBe("a-b");
  });
  it("falls back to 'section' for empty/all-symbol text", () => {
    expect(S.slugify("")).toBe("section");
    expect(S.slugify("!!!")).toBe("section");
  });
});

describe("addIds", () => {
  it("ids headings by text slug, preserving existing ids", () => {
    const root = rootWith('<h2 id="keep">Funding</h2><h2>Jobs & Growth</h2>');
    S.addIds(root);
    const headings = root.querySelectorAll("h2");
    expect(headings[0].id).toBe("keep"); // preserved
    expect(headings[1].id).toBe("jobs-growth"); // slug
  });

  it("disambiguates colliding slugs with -2, -3", () => {
    const root = rootWith("<h2>Results</h2><h2>Results</h2><h2>Results</h2>");
    S.addIds(root);
    const ids = Array.from(root.querySelectorAll("h2")).map((h) => h.id);
    expect(ids).toEqual(["results", "results-2", "results-3"]);
  });

  it("avoids colliding with a pre-existing non-heading id", () => {
    const root = rootWith('<div id="results"></div><h2>Results</h2>');
    S.addIds(root);
    expect(root.querySelector("h2").id).toBe("results-2"); // existing "results" taken
  });

  it("ids tables and figures sequentially", () => {
    const root = rootWith(
      "<table><tbody><tr><td>1</td></tr></tbody></table>" +
        "<figure>x</figure><figure>y</figure>"
    );
    S.addIds(root);
    expect(root.querySelector("table").id).toBe("tbl-1");
    const figs = root.querySelectorAll("figure");
    expect(figs[0].id).toBe("fig-1");
    expect(figs[1].id).toBe("fig-2");
  });
});

describe("addOnThisPage", () => {
  function sampleDoc() {
    return rootWith(
      "<h1>Page title</h1>" +
        "<p>Intro</p>" +
        "<h2>Overview</h2><p>body</p>" +
        "<h2>Details</h2><h3>Sub A</h3><h3>Sub B</h3>" +
        "<h2>Funding</h2>"
    );
  }

  it("builds a flat list of h2 links when depth is 2", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2 });
    const nav = root.querySelector("nav.on-this-page");
    expect(nav).not.toBe(null);
    expect(nav.querySelector("h2").textContent).toBe("On this page");
    const topLinks = Array.from(nav.querySelectorAll("ul > li > a")).map((a) => a.textContent);
    expect(topLinks).toEqual(["Overview", "Details", "Funding"]);
  });

  it("nests h3 under its parent h2 when depth is 3", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 3 });
    const nav = root.querySelector("nav.on-this-page");
    const detailsItem = Array.from(nav.querySelectorAll("ul > li")).find((li) =>
      li.firstChild.textContent.startsWith("Details")
    );
    const subLinks = Array.from(detailsItem.querySelectorAll("ul > li > a")).map((a) => a.textContent);
    expect(subLinks).toEqual(["Sub A", "Sub B"]);
  });

  it("links resolve to real heading ids (no dangling hrefs)", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 3 });
    const ids = new Set(Array.from(root.querySelectorAll("[id]")).map((el) => el.id));
    root.querySelectorAll("nav.on-this-page a").forEach((a) => {
      const target = a.getAttribute("href").slice(1);
      expect(ids.has(target)).toBe(true);
    });
  });

  it("excludes h1 (the page title)", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2 });
    const texts = Array.from(root.querySelectorAll("nav.on-this-page a")).map((a) => a.textContent);
    expect(texts).not.toContain("Page title");
  });

  it("is idempotent — re-running replaces the nav, no duplicates", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2 });
    S.addOnThisPage(root, { depth: 2 });
    expect(root.querySelectorAll("nav.on-this-page")).toHaveLength(1);
  });

  it("returns false and inserts nothing when there are no h2 headings", () => {
    const root = rootWith("<h1>Only a title</h1><p>no sections</p>");
    const ok = S.addOnThisPage(root, { depth: 2 });
    expect(ok).toBe(false);
    expect(root.querySelector("nav.on-this-page")).toBe(null);
  });
});
