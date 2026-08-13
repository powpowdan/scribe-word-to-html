// Document commands: Add IDs (headings/tables/figures) and On-this-page nav.
// Operate on a root element (the Live view) and produce Canada.ca/WET-friendly
// structure. The "On this page" block follows the standard in-page Canada.ca
// pattern (<nav> + <h2>On this page</h2> + <ul> of heading links).
//
// Pure DOM operations -> fully headlessly testable.
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // Slug: lowercase, runs of non-alphanumeric -> single "-", trimmed.
  // Falls back to "section" for empty/all-symbol text.
  function slugify(text) {
    const s = String(text == null ? "" : text)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || "section";
  }

  function collectExistingIds(root) {
    const ids = new Set();
    root.querySelectorAll("[id]").forEach((el) => ids.add(el.id));
    return ids;
  }

  // First free id starting from `base` (then base-2, base-3, ...).
  function uniqueId(base, existing) {
    if (!existing.has(base)) {
      existing.add(base);
      return base;
    }
    let n = 2;
    while (existing.has(base + "-" + n)) n++;
    const id = base + "-" + n;
    existing.add(id);
    return id;
  }

  // Give every section heading (h1-h6) an id, skipping any heading inside an
  // "On this page" nav. Returns the count of ids newly assigned.
  function ensureHeadingIds(root, existing) {
    let count = 0;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
      if (h.closest("nav.on-this-page")) return;
      if (h.id) return;
      h.id = uniqueId(slugify(h.textContent), existing);
      count++;
    });
    return count;
  }

  // Assign ids to headings (text slug), tables (tbl-N), and figures (fig-N).
  // Existing ids are always preserved; new ids avoid collisions with ALL ids.
  function addIds(root) {
    const existing = collectExistingIds(root);
    ensureHeadingIds(root, existing);
    let t = 0;
    root.querySelectorAll("table").forEach((el) => {
      if (el.id) return;
      t++;
      el.id = uniqueId("tbl-" + t, existing);
    });
    let f = 0;
    root.querySelectorAll("figure").forEach((el) => {
      if (el.id) return;
      f++;
      el.id = uniqueId("fig-" + f, existing);
    });
    return { tables: t, figures: f };
  }

  // Build a nested <ul> from a list of heading elements (document order),
  // nesting by heading level. Empty sub-lists are pruned afterwards.
  function buildOnThisPageList(headings) {
    const rootList = document.createElement("ul");
    const stack = [{ level: 1, ul: rootList }]; // sentinel parent
    headings.forEach((h) => {
      const level = parseInt(h.tagName.charAt(1), 10);
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
      stack[stack.length - 1].ul.appendChild(li);
      const subUl = document.createElement("ul");
      li.appendChild(subUl);
      stack.push({ level: level, ul: subUl });
    });
    // Prune the empty <ul> placeholders.
    rootList.querySelectorAll("ul").forEach((u) => {
      if (!u.children.length) u.remove();
    });
    return rootList;
  }

  // Insert/refresh an "On this page" nav built from h2..h{depth} (default h2).
  // h1 is treated as the page title and excluded. Idempotent: any prior nav we
  // generated is replaced. Returns true if a nav was inserted.
  function addOnThisPage(root, opts) {
    opts = opts || {};
    const depth = Math.min(Math.max(opts.depth == null ? 2 : opts.depth, 1), 6);

    // Remove a previously-generated nav first (so its heading isn't id'd).
    const old = root.querySelector("nav.on-this-page");
    if (old) old.remove();

    // Make sure the section headings have ids so links resolve.
    const existing = collectExistingIds(root);
    ensureHeadingIds(root, existing);

    const selectors = [];
    for (let lvl = 2; lvl <= depth; lvl++) selectors.push("h" + lvl);
    const headings = selectors.length
      ? Array.from(root.querySelectorAll(selectors.join(",")))
      : [];
    if (!headings.length) return false;

    const nav = document.createElement("nav");
    nav.className = "on-this-page mrgn-tp-md";
    nav.setAttribute("aria-label", "On this page");
    const h2 = document.createElement("h2");
    h2.textContent = "On this page";
    nav.appendChild(h2);
    nav.appendChild(buildOnThisPageList(headings));

    root.insertBefore(nav, root.firstChild);
    return true;
  }

  S.documentCommands = {
    slugify,
    collectExistingIds,
    uniqueId,
    ensureHeadingIds,
    addIds,
    addOnThisPage
  };
})(window.Scribe || (window.Scribe = {}));
