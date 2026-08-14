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

  // Localized "On this page" title (i18n.js may not be loaded in every host).
  function onThisPageTitle(lang) {
    if (S.i18n && S.i18n.STRINGS[lang]) return S.i18n.STRINGS[lang].onThisPage;
    return "On this page";
  }

  // Build a nested <ul class="lst-spcd"> from a list of heading elements
  // (document order), nesting by heading level. Optional hierarchical
  // numbering ("1. ", "1.1. ") prefixes the entry text (entries only — the
  // document headings themselves are never numbered), and boldTop wraps
  // top-level (h2) entry anchors in <strong>. Empty sub-lists are pruned.
  function buildOnThisPageList(headings, opts) {
    opts = opts || {};
    const numbered = !!opts.numbered;
    const boldTop = !!opts.boldH2;
    const counters = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    const rootList = document.createElement("ul");
    rootList.className = "lst-spcd";
    const stack = [{ level: 1, ul: rootList }]; // sentinel parent
    headings.forEach((h) => {
      const level = parseInt(h.tagName.charAt(1), 10);

      let prefix = "";
      if (numbered) {
        counters[level]++;
        for (let l = level + 1; l <= 6; l++) counters[l] = 0;
        const parts = [];
        for (let l = 2; l <= level; l++) parts.push(counters[l]);
        prefix = parts.join(".") + ". ";
      }

      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.id;
      if (boldTop && level === 2) {
        const strong = document.createElement("strong");
        strong.textContent = prefix + h.textContent.trim();
        a.appendChild(strong);
      } else {
        a.textContent = prefix + h.textContent.trim();
      }
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

  // Remove any previously generated "On this page" block: a bare
  // nav.gc-toc / legacy nav.on-this-page, or a <details> wrapper that
  // contains one (the collapsible variant). Makes regeneration idempotent
  // across variants.
  function removeExistingOnThisPage(root) {
    Array.from(root.querySelectorAll("details")).forEach((d) => {
      if (d.querySelector("nav.gc-toc, nav.on-this-page")) d.remove();
    });
    root.querySelectorAll("nav.gc-toc, nav.on-this-page").forEach((n) => n.remove());
  }

  // Insert/refresh the in-page ToC ("On this page", official GCWeb gc-toc
  // pattern) built from h2..h{depth} (default h2). h1 is treated as the page
  // title and excluded. Options:
  //   depth       — deepest heading level included (2..6, default 2)
  //   lang        — "en" | "fr" heading/summary text (default en)
  //   numbered    — hierarchical "1. " / "1.1. " prefixes on entries only
  //   boldH2      — <strong> on top-level entry anchors
  //   collapsible — <details><summary>…</summary><nav…/></details> variant
  // Idempotent: any prior block we generated (any variant) is replaced.
  // Returns true if a block was inserted.
  function addOnThisPage(root, opts) {
    opts = opts || {};
    const depth = Math.min(Math.max(opts.depth == null ? 2 : opts.depth, 1), 6);
    const lang = opts.lang === "fr" ? "fr" : "en";
    const title = onThisPageTitle(lang);

    removeExistingOnThisPage(root);

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
    nav.className = "gc-toc";
    if (!opts.collapsible) {
      const h2 = document.createElement("h2");
      h2.textContent = title;
      nav.appendChild(h2);
    }
    nav.appendChild(buildOnThisPageList(headings, opts));

    if (opts.collapsible) {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = title;
      details.appendChild(summary);
      details.appendChild(nav); // nav without its own heading
      root.insertBefore(details, root.firstChild);
    } else {
      root.insertBefore(nav, root.firstChild);
    }
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
