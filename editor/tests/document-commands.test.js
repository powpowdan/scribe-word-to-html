import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Headless coverage for the document-structure commands (Add IDs, On this
// page). Pure DOM operations on a root element.

const win = loadScribe(["i18n.js", "document-commands.js"]);
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

describe("addOnThisPage (gc-toc)", () => {
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
    const nav = root.querySelector("nav.gc-toc");
    expect(nav).not.toBe(null);
    expect(nav.querySelector("h2").textContent).toBe("On this page"); // no colon
    const topLinks = Array.from(nav.querySelectorAll("ul > li > a")).map((a) => a.textContent);
    expect(topLinks).toEqual(["Overview", "Details", "Funding"]);
  });

  it("nests h3 under its parent h2 when depth is 3", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 3 });
    const nav = root.querySelector("nav.gc-toc");
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
    root.querySelectorAll("nav.gc-toc a").forEach((a) => {
      const target = a.getAttribute("href").slice(1);
      expect(ids.has(target)).toBe(true);
    });
  });

  it("excludes h1 (the page title)", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2 });
    const texts = Array.from(root.querySelectorAll("nav.gc-toc a")).map((a) => a.textContent);
    expect(texts).not.toContain("Page title");
  });

  it("is idempotent — re-running replaces the nav, no duplicates", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2 });
    S.addOnThisPage(root, { depth: 2 });
    expect(root.querySelectorAll("nav.gc-toc")).toHaveLength(1);
  });

  it("returns false and inserts nothing when there are no h2 headings", () => {
    const root = rootWith("<h1>Only a title</h1><p>no sections</p>");
    const ok = S.addOnThisPage(root, { depth: 2 });
    expect(ok).toBe(false);
    expect(root.querySelector("nav.gc-toc")).toBe(null);
  });

  // ----- Options from the legacy ToC builder (merged feature) -----

  it("numbered: hierarchical prefixes on entries only (headings untouched)", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 3, numbered: true });
    const nav = root.querySelector("nav.gc-toc");
    // Top-level entries = direct li children of the root list (their own
    // anchor precedes any nested sub-list).
    const topList = nav.querySelector("ul.lst-spcd");
    const topLinks = Array.from(topList.children).map((li) => li.querySelector("a").textContent);
    expect(topLinks).toEqual(["1. Overview", "2. Details", "3. Funding"]);
    const subs = Array.from(nav.querySelectorAll("ul > li > ul > li > a")).map((a) => a.textContent);
    expect(subs).toEqual(["2.1. Sub A", "2.2. Sub B"]);
    // The document headings themselves are never numbered (the first content
    // h2 — not the ToC's own h2, which is "On this page").
    const contentH2 = Array.from(root.querySelectorAll("h2")).find((h) => !h.closest("nav.gc-toc"));
    expect(contentH2.textContent).toBe("Overview");
  });

  it("boldH2: top-level entry anchors wrap their text in <strong>", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, boldH2: true });
    const nav = root.querySelector("nav.gc-toc");
    const first = nav.querySelector("ul > li > a");
    expect(first.querySelector("strong").textContent).toBe("Overview");
  });

  it("collapsible: details/summary variant, nav carries no heading", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, collapsible: true });
    const details = root.querySelector("details");
    expect(details).not.toBe(null);
    expect(details.querySelector("summary").textContent).toBe("On this page");
    const nav = details.querySelector("nav.gc-toc");
    expect(nav).not.toBe(null);
    expect(nav.querySelector("h2")).toBe(null); // summary replaces the heading
  });

  it("idempotent across variants — collapsible then plain leaves no <details>", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, collapsible: true });
    S.addOnThisPage(root, { depth: 2 }); // regenerate plain
    expect(root.querySelectorAll("nav.gc-toc")).toHaveLength(1);
    expect(root.querySelector("details")).toBe(null);
  });

  it("replaces a legacy nav.on-this-page block from earlier editor versions", () => {
    const root = sampleDoc();
    const legacy = document.createElement("nav");
    legacy.className = "on-this-page";
    root.insertBefore(legacy, root.firstChild);
    S.addOnThisPage(root, { depth: 2 });
    expect(root.querySelector("nav.on-this-page")).toBe(null);
    expect(root.querySelectorAll("nav.gc-toc")).toHaveLength(1);
  });

  // ----- Bilingual -----

  it("FR: heading and links use the official French title", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, lang: "fr" });
    const nav = root.querySelector("nav.gc-toc");
    expect(nav.querySelector("h2").textContent).toBe("Sur cette page");
    expect(nav.querySelectorAll("ul > li > a").length).toBe(3);
  });

  it("FR collapsible: summary text is French", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, lang: "fr", collapsible: true });
    expect(root.querySelector("details summary").textContent).toBe("Sur cette page");
  });

  it("switching language never rewrites an existing block (non-retroactive)", () => {
    const root = sampleDoc();
    S.addOnThisPage(root, { depth: 2, lang: "en" });
    // User flips the switch to FR (simulated)…
    if (win.Scribe.i18n) win.Scribe.i18n.setLanguage("fr");
    // …and the already-generated block is untouched until explicitly regenerated.
    expect(root.querySelector("nav.gc-toc h2").textContent).toBe("On this page");
    S.addOnThisPage(root, { depth: 2, lang: "fr" }); // explicit regen
    expect(root.querySelector("nav.gc-toc h2").textContent).toBe("Sur cette page");
  });
});
