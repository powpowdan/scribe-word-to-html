// Document report panel — read-only observation of the document: a navigable
// heading outline, a tag/selector counter (with save/recall presets), and an
// issues-to-review lint list. The activity log and health-score badge from the
// original qa-panel spec were dropped per scope.
//
// Pure functions (buildOutline / countSelectors / detectIssues) operate on a
// root element and are headlessly testable; mountQaPanel() wires them to the
// document model + a Live view (for click-to-jump navigation).
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  const PRESET_KEY = "scribe.countPresets.v1";

  // Structural tags auto-populated into the counts box (the HTML structure of
  // the page). Only prefills an empty textarea — user edits are preserved.
  const DEFAULT_COUNT_SELECTORS = ["h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "figure"];

  // Content-review wordlists, matched case-insensitively. Drafting markers
  // use word boundaries; weak link phrases match the trimmed link text.
  const PROSE_MARKERS = ["todo", "tbd", "lorem ipsum", "xxx"];
  const WEAK_LINK_PHRASES = ["click here", "cliquez ici"];
  const PROSE_MARKER_RE = new RegExp("\\b(?:" + PROSE_MARKERS.join("|") + ")\\b", "i");
  // Blocks whose textContent is scanned for markers — the same selector
  // resolves `block` locators, so detection and navigation stay aligned.
  const PROSE_BLOCK_SELECTOR = "p, li, blockquote, figcaption, caption, h1, h2, h3, h4, h5, h6";
  const PLACEHOLDER_SELECTOR = "figure.img-placeholder, .img-placeholder";

  function isRealHeading(h) {
    // Skip headings that belong to a generated "On this page" ToC block
    // (current gc-toc component or the earlier on-this-page variant).
    return !h.closest("nav.gc-toc") && !h.closest("nav.on-this-page");
  }

  // Flat list of { level, id, text, index } in document order. `index` is the
  // position among real headings — used for click-to-jump when there is no id.
  function buildOutline(root) {
    const out = [];
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
      if (!isRealHeading(h)) return;
      out.push({
        level: parseInt(h.tagName.charAt(1), 10),
        id: h.id || null,
        text: h.textContent.trim(),
        index: out.length
      });
    });
    return out;
  }

  // [{ selector, count, error? }] — invalid selectors are reported, not thrown.
  function countSelectors(root, selectors) {
    return (selectors || []).map((sel) => {
      const s = String(sel == null ? "" : sel).trim();
      if (!s) return { selector: "", count: 0, empty: true };
      try {
        return { selector: s, count: root.querySelectorAll(s).length };
      } catch (e) {
        return { selector: s, count: 0, error: true };
      }
    });
  }

  // Canada.ca publishing lint. Each issue: { type, message, id?, locator? }
  // — id used for navigation when available; locator { kind, index } gives a
  // document-position fallback so id-less issues stay clickable.
  function detectIssues(root) {
    const issues = [];

    // Ids in the document — one pass feeds duplicate-id detection and the
    // broken-anchor target set.
    const byId = new Map();
    root.querySelectorAll("[id]").forEach((el) => {
      const list = byId.get(el.id) || [];
      list.push(el);
      byId.set(el.id, list);
    });
    const ids = new Set(byId.keys());
    byId.forEach((els, id) => {
      // One row per element after the first; id navigation lands on the
      // first occurrence, which the message identifies.
      for (let i = 1; i < els.length; i++) {
        issues.push({
          type: "duplicate-id",
          message: 'Duplicate id "' + id + '" — used ' + els.length + " times",
          id: id
        });
      }
    });

    // Heading hierarchy + ids + empty headings.
    let prevLevel = 0;
    let headingIdx = 0;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
      if (!isRealHeading(h)) return;
      const level = parseInt(h.tagName.charAt(1), 10);
      const text = h.textContent.trim();
      const locator = { kind: "heading", index: headingIdx++ };
      if (!text) {
        issues.push({ type: "empty-heading", message: "Empty heading", id: h.id || null, locator });
      }
      if (prevLevel && level > prevLevel + 1) {
        issues.push({
          type: "skipped-level",
          message: "Skipped heading level (h" + prevLevel + " \u2192 h" + level + ")" + (text ? ": \"" + text + "\"" : ""),
          id: h.id || null,
          locator
        });
      }
      if (!h.id) {
        issues.push({ type: "heading-no-id", message: "Heading without an id" + (text ? ": \"" + text + "\"" : ""), id: null, locator, fix: "add-id" });
      }
      prevLevel = level;
    });

    // Tables without ids, and tables with a missing/empty caption (the
    // table editor normally writes one; Code-view edits bypass it).
    let tableIdx = 0;
    root.querySelectorAll("table").forEach((t) => {
      const locator = { kind: "table", index: tableIdx++ };
      if (!t.id) issues.push({ type: "table-no-id", message: "Table without an id", id: null, locator, fix: "add-id" });
      const caption = t.querySelector("caption");
      if (!caption || !caption.textContent.trim()) {
        issues.push({
          type: "table-no-caption",
          message: "Table without a caption" + (t.id ? ': "' + t.id + '"' : ""),
          id: t.id || null,
          locator
        });
      }
    });

    // Figures without ids.
    let figureIdx = 0;
    root.querySelectorAll("figure").forEach((f) => {
      const locator = { kind: "figure", index: figureIdx++ };
      if (!f.id) issues.push({ type: "figure-no-id", message: "Figure without an id", id: null, locator, fix: "add-id" });
    });

    // Leftover image placeholders — one row each so every row navigates.
    root.querySelectorAll(PLACEHOLDER_SELECTOR).forEach((p, i) => {
      const label = (p.getAttribute("data-img-alt") || p.textContent || "")
        .trim()
        .replace(/^\[IMAGE:?\s*/i, "")
        .replace(/\]$/, "")
        .trim();
      issues.push({
        type: "image-placeholder",
        message: "Image placeholder still present — handle the image" + (label ? ': "' + label + '"' : ""),
        id: p.id || null,
        locator: { kind: "placeholder", index: i }
      });
    });

    // Links with empty / placeholder href. A name-only anchor (no href) is a
    // bookmark, not a link — not an issue (Word bookmarks are stripped at the
    // boundaries, but mid-edit they can be present without being flagged).
    let linkIdx = 0;
    root.querySelectorAll("a").forEach((a) => {
      const locator = { kind: "link", index: linkIdx++ };
      const href = (a.getAttribute("href") || "").trim();
      if (!href && a.getAttribute("name")) return; // bookmark, not a link
      if (!href || href === "#") {
        const label = a.textContent.trim();
        issues.push({ type: "bad-link", message: "Link with empty or placeholder href" + (label ? ': "' + label + '"' : ""), id: a.id || null, locator, fix: "strip-link" });
      }
    });

    // Internal links whose target id does not exist — catches anchors and
    // stale "On this page" (gc-toc) entries alike, since both are plain
    // internal links. External/relative hrefs are never checked.
    let anchorIdx = 0;
    root.querySelectorAll("a").forEach((a) => {
      const locator = { kind: "link", index: anchorIdx++ };
      const href = (a.getAttribute("href") || "").trim();
      if (href.length > 1 && href.charAt(0) === "#") {
        const frag = href.slice(1);
        if (!ids.has(frag)) {
          const label = a.textContent.trim();
          issues.push({
            type: "broken-anchor",
            message: 'Link to missing target "#' + frag + '"' + (label ? ': "' + label + '"' : ""),
            id: a.id || null,
            locator
          });
        }
      }
    });

    // Drafting residue (TODO, lorem ipsum, ...) in block text, checked per
    // block so markers split across inline formatting are still caught. A
    // block nested inside an already-flagged block is skipped (a TODO in a
    // list reports the li, not also its inner p).
    Array.from(root.querySelectorAll(PROSE_BLOCK_SELECTOR)).forEach((b, i) => {
      const m = PROSE_MARKER_RE.exec(b.textContent);
      if (!m) return;
      const ancestor = b.parentElement ? b.parentElement.closest(PROSE_BLOCK_SELECTOR) : null;
      if (ancestor && PROSE_MARKER_RE.test(ancestor.textContent)) return;
      issues.push({
        type: "prose-marker",
        message: 'Drafting marker "' + m[0] + '" left in text',
        id: b.id || null,
        locator: { kind: "block", index: i }
      });
    });

    // Generic link text ("click here") — the link's trimmed text equals the
    // phrase, ignoring case and surrounding punctuation. Occurrences in
    // plain prose are never flagged.
    let weakIdx = 0;
    root.querySelectorAll("a").forEach((a) => {
      const locator = { kind: "link", index: weakIdx++ };
      const label = a.textContent.trim();
      const t = label.toLowerCase().replace(/^[\s.,;:!?"'()\u2026]+/, "").replace(/[\s.,;:!?"'()\u2026]+$/, "");
      if (WEAK_LINK_PHRASES.indexOf(t) !== -1) {
        issues.push({ type: "weak-link-text", message: 'Uninformative link text: "' + label + '"', id: a.id || null, locator });
      }
    });

    return issues;
  }

  // ---- Mounter ----
  // config: { model, liveRoot, outlineEl, issuesEl, issuesCountEl, countInput,
  //           countBtn, countResults, presetSelect, presetSaveBtn,
  //           presetRecallBtn, toaster, storage }
  function mountQaPanel(config) {
    config = config || {};
    const model = config.model;
    const liveRoot = config.liveRoot;
    const outlineEl = config.outlineEl;
    const issuesEl = config.issuesEl;
    const issuesCountEl = config.issuesCountEl;
    const countInput = config.countInput;
    const countBtn = config.countBtn;
    const countResults = config.countResults;
    const presetSelect = config.presetSelect;
    const presetSaveBtn = config.presetSaveBtn;
    const presetRecallBtn = config.presetRecallBtn;
    const toaster = config.toaster;
    const storage = config.storage || (typeof localStorage !== "undefined" ? localStorage : null);

    function parseModel() {
      const c = document.createElement("div");
      c.innerHTML = model ? model.getHTML() : "";
      return c;
    }

    function navigateToId(id) {
      if (!liveRoot || !id) return false;
      let el;
      try {
        el = liveRoot.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(id) : id));
      } catch (e) {
        el = liveRoot.querySelector("#" + id);
      }
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      return false;
    }

    // Resolve a locator to the live element inside `root` (nth real heading /
    // table / figure / link in document order). Shared by click-to-jump
    // navigation and one-click fixes.
    function resolveLocator(root, locator) {
      if (!root || !locator) return null;
      if (locator.kind === "heading") {
        const headings = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(isRealHeading);
        return headings[locator.index] || null;
      }
      if (locator.kind === "table") return root.querySelectorAll("table")[locator.index] || null;
      if (locator.kind === "figure") return root.querySelectorAll("figure")[locator.index] || null;
      if (locator.kind === "link") return root.querySelectorAll("a")[locator.index] || null;
      if (locator.kind === "placeholder") return root.querySelectorAll(PLACEHOLDER_SELECTOR)[locator.index] || null;
      if (locator.kind === "block") return root.querySelectorAll(PROSE_BLOCK_SELECTOR)[locator.index] || null;
      return null;
    }

    // Position-based navigation: jump to the nth real heading / table / figure
    // / link in the Live view. Makes every outline entry and issue clickable
    // even when the target has no id.
    function navigateToLocator(locator) {
      if (!liveRoot || !locator) return false;
      const el = resolveLocator(liveRoot, locator);
      if (el && el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      return false;
    }

    function navigate(item) {
      // Prefer the id when present; fall back to the document position.
      if (item && item.id && navigateToId(item.id)) return true;
      return navigateToLocator(item && item.locator);
    }

    function renderOutline() {
      if (!outlineEl) return;
      const items = buildOutline(parseModel());
      outlineEl.innerHTML = "";
      if (!items.length) {
        outlineEl.innerHTML = '<p class="qa-empty">No headings.</p>';
        return;
      }
      const rootList = document.createElement("ul");
      const stack = [{ level: 0, ul: rootList }];
      items.forEach((it) => {
        while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
        const li = document.createElement("li");
        li.className = "qa-outline-l" + it.level;
        const a = document.createElement("a");
        a.textContent = it.text || "(empty heading)";
        // Every entry navigates (by id when present, by position otherwise);
        // id-less headings keep the greyed style and gain a "no id" marker so
        // the outline doubles as a missing-id scan.
        a.href = "#";
        if (!it.id) {
          a.className = "qa-no-nav";
          const mark = document.createElement("span");
          mark.className = "qa-no-id-mark";
          mark.textContent = " \u00b7 no id";
          a.appendChild(mark);
        }
        a.addEventListener("click", (e) => {
          e.preventDefault();
          navigate(it);
        });
        li.appendChild(a);
        stack[stack.length - 1].ul.appendChild(li);
        const sub = document.createElement("ul");
        li.appendChild(sub);
        stack.push({ level: it.level, ul: sub });
      });
      rootList.querySelectorAll("ul").forEach((u) => { if (!u.children.length) u.remove(); });
      outlineEl.appendChild(rootList);
    }

    // ---- One-click fixes ----
    // Fixes edit the document through the model (labeled command writes, so
    // they are undoable); the panel's model subscription re-lints and
    // re-renders the issues list when the write lands.
    function applyFix(issue) {
      if (!model || !issue || !issue.fix) return false;
      const container = parseModel();
      const el = issue.id
        ? container.querySelector("#" + issue.id)
        : resolveLocator(container, issue.locator);
      if (!el) return false;

      if (issue.fix === "add-id") {
        if (!S.documentCommands || !S.documentCommands.assignElementId(el, container)) {
          return false;
        }
        model.setHTML(container.innerHTML, "command", "Add ID");
        return true;
      }
      if (issue.fix === "strip-link") {
        // Unwrap the anchor — its text content stays in the document.
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.remove();
        model.setHTML(container.innerHTML, "command", "Strip link");
        return true;
      }
      return false;
    }

    function renderIssues() {
      if (!issuesEl) return;
      const issues = detectIssues(parseModel());
      // Live count badge on the section heading (qa-panel spec): shown with
      // the count while issues exist, hidden when the document is clean (the
      // "No issues found." row below is the clean state).
      if (issuesCountEl) {
        if (issues.length) {
          issuesCountEl.textContent = String(issues.length);
          issuesCountEl.removeAttribute("hidden");
        } else {
          issuesCountEl.setAttribute("hidden", "");
        }
      }
      issuesEl.innerHTML = "";
      if (!issues.length) {
        issuesEl.innerHTML = '<p class="qa-ok"><i class="fa-solid fa-circle-check"></i> No issues found.</p>';
        return;
      }
      const ul = document.createElement("ul");
      ul.className = "qa-issues";
      issues.forEach((iss) => {
        const li = document.createElement("li");
        li.className = "qa-issue qa-" + iss.type;
        li.textContent = iss.message;
        // One-click fix where a safe mechanical fix exists. The click must
        // not fall through to the row's navigate handler.
        if (iss.fix) {
          const fixBtn = document.createElement("button");
          fixBtn.type = "button";
          fixBtn.className = "btn btn-sm btn-outline-primary qa-fix-btn";
          fixBtn.textContent = iss.fix === "add-id" ? "Add ID" : "Strip link";
          fixBtn.title = iss.fix === "add-id"
            ? "Assign the Add-IDs-scheme id to this element"
            : "Remove the link, keep its text";
          fixBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const ok = applyFix(iss);
            if (!ok && toaster) toaster.show("Could not fix — the document may have changed.", "warn");
          });
          li.appendChild(fixBtn);
        }
        // Clickable whenever we can find the target (id or position).
        if (iss.id || iss.locator) {
          li.className += " qa-clickable";
          li.addEventListener("click", () => navigate(iss));
        }
        ul.appendChild(li);
      });
      issuesEl.appendChild(ul);
    }

    function runCounts() {
      if (!countResults) return;
      const lines = countInput && countInput.value
        ? countInput.value.split(/\n+/).map((s) => s.trim()).filter(Boolean)
        : [];
      const results = countSelectors(parseModel(), lines);
      countResults.innerHTML = "";
      if (!results.length) {
        countResults.innerHTML = '<p class="qa-empty">Enter tags or selectors above, then Count.</p>';
        return;
      }
      // Only show selectors that match something (count > 0) — the box reads
      // as "what exists in this page". Invalid selectors still surface.
      let shown = 0;
      results.forEach((r) => {
        if (r.empty || (!r.error && r.count === 0)) return;
        const row = document.createElement("div");
        row.className = "qa-count-row";
        const prefix = r.error ? "\u26a0 " : "";
        row.textContent = prefix + r.selector + " = " + r.count;
        if (r.error) row.classList.add("qa-count-error");
        countResults.appendChild(row);
        shown++;
      });
      if (!shown) {
        countResults.innerHTML = '<p class="qa-empty">No matches for these selectors.</p>';
      }
    }

    // ---- Presets (localStorage) ----
    function readPresets() {
      if (!storage) return {};
      try { return JSON.parse(storage.getItem(PRESET_KEY) || "{}"); } catch (e) { return {}; }
    }
    function writePresets(obj) {
      if (!storage) return;
      try { storage.setItem(PRESET_KEY, JSON.stringify(obj)); } catch (e) {}
    }
    function refreshPresetSelect() {
      if (!presetSelect) return;
      const presets = readPresets();
      presetSelect.innerHTML = "";
      const names = Object.keys(presets).sort();
      if (!names.length) {
        const o = document.createElement("option");
        o.value = "";
        o.textContent = "(no presets)";
        presetSelect.appendChild(o);
        return;
      }
      names.forEach((name) => {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        presetSelect.appendChild(o);
      });
    }
    if (presetSaveBtn) {
      presetSaveBtn.addEventListener("click", () => {
        const name = window.prompt("Save count preset as:", "preset");
        if (!name) return;
        const presets = readPresets();
        presets[name] = countInput ? countInput.value : "";
        writePresets(presets);
        refreshPresetSelect();
        if (toaster) toaster.show("Preset saved: " + name, "success");
      });
    }
    if (presetRecallBtn) {
      presetRecallBtn.addEventListener("click", () => {
        if (!presetSelect || !countInput) return;
        const name = presetSelect.value;
        if (!name) return;
        const presets = readPresets();
        if (presets[name] != null) {
          countInput.value = presets[name];
          runCounts();
        }
      });
    }
    if (countBtn) countBtn.addEventListener("click", runCounts);

    // ---- Live updates ----
    if (model && typeof model.subscribe === "function") {
      model.subscribe(() => {
        renderOutline();
        renderIssues();
        runCounts();
      });
    }
    // Prefill the structural tags (h1-h6, table, ul, ol, figure) when the
    // counts box is empty — the user's edits/presets are never overwritten.
    if (countInput && !countInput.value.trim()) {
      countInput.value = DEFAULT_COUNT_SELECTORS.join("\n");
    }
    renderOutline();
    renderIssues();
    runCounts();
    refreshPresetSelect();

    return { renderOutline, renderIssues, runCounts, refreshPresetSelect };
  }

  S.qaPanel = {
    PRESET_KEY,
    DEFAULT_COUNT_SELECTORS,
    PROSE_MARKERS,
    WEAK_LINK_PHRASES,
    buildOutline,
    countSelectors,
    detectIssues,
    mountQaPanel
  };
})(window.Scribe || (window.Scribe = {}));
