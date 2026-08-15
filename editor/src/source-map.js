// Source map: exact correspondence between Live-view DOM elements and
// character ranges / lines in the canonical Code-view HTML.
//
// The Code text is normally *generated*: liveView.read() runs a normalized
// clone through the block-level pretty-printer. buildSourceMap() performs the
// SAME normalization and the SAME serialization (prettyHTMLDetailed), but
// records each element's opening-tag range, close-tag start, and lines while
// walking. When the Code text equals that serializer output (the common
// case), the map is exact with no parser. For hand-edited text, callers fall
// back to fallbackRange() (opening-tag text + ordinal) — best-effort only,
// never a confident wrong jump.
//
// Elements are keyed by BLOCK-INDEX PATH: the index of each element among the
// block-element children of its parent, from the container root down. Inline
// normalization noise (b→strong, removed bookmarks, stripped .selected) is
// invisible to block paths. The one block-level normalization — wrapping each
// <table> in a .table-responsive div — is mirrored by liveBlockPath() /
// resolveBlockPath() (the wrapper is one-to-one with its table).
//
// Pure module (no DOM events). Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  var isBlock = S.isBlockElement;

  // ---- normalization (identical to liveView.read()) ----

  // Editor-only classes that must never reach the document model: the table
  // editor's selection state and the view-linking highlight/flash state.
  const EDITOR_CLASSES = ["selected", "hovered", "scribe-hover-linked", "scribe-flash"];

  // Remove the class attribute when stripping leaves it empty —
  // classList.remove() materializes class="" on previously classless
  // elements, which serialization would then leak into the document.
  function stripClassIfEmpty(el) {
    if (el && el.getAttribute && el.getAttribute("class") === "") {
      el.removeAttribute("class");
    }
  }

  // Shared canonicalization step: strip every editor-only class and drop
  // empty class attributes. Used by liveView.read() (the model's source)
  // AND normalizeClone() (the map) so the two can never diverge — the
  // duplication is how highlight classes once leaked into documents.
  // Self-healing: documents polluted before this ran get scrubbed on their
  // next commit, recovery copies included.
  function stripEditorState(container) {
    container.querySelectorAll("[class]").forEach((el) => {
      el.classList.remove.apply(el.classList, EDITOR_CLASSES);
      stripClassIfEmpty(el);
    });
    return container;
  }

  function normalizeClone(root) {
    const clone = root.cloneNode(true);
    stripEditorState(clone);
    if (S.normalizeBoldItalic) S.normalizeBoldItalic(clone);
    if (S.ensureTableResponsive) S.ensureTableResponsive(clone);
    if (S.stripWordBookmarks) S.stripWordBookmarks(clone);
    return clone;
  }

  // Canonicalize arbitrary code text: parse into a container and run the
  // pretty-printer. Note: unlike read() this does NOT apply live-tree
  // normalizations (b→strong, table wrappers) — canonicality here means "is
  // this byte-identical to what the pretty-printer would emit for its own
  // parse", which is what exact mapping needs.
  function tidyHtml(text) {
    const c = document.createElement("div");
    c.innerHTML = String(text);
    return S.prettyHTML(c);
  }

  function isCanonical(text) {
    try {
      return tidyHtml(text) === text;
    } catch (e) {
      return false;
    }
  }

  // ---- block-index paths ----

  function blockChildren(parent) {
    const out = [];
    for (const n of Array.from(parent.childNodes)) {
      if (isBlock(n)) out.push(n);
    }
    return out;
  }

  // Path of `el` in the NORMALIZED coordinate system (what the code text
  // contains). `el` may live in the normalized clone (paths come out
  // naturally) or in the live tree — in that case each <table> whose parent
  // is not already .table-responsive gets the synthetic wrapper's component
  // inserted (the wrapper occupies the table's index; the table is its only
  // block child, index 0).
  function liveBlockPath(root, el) {
    const path = [];
    let node = el;
    while (node && node !== root) {
      if (node.nodeType === 1 && isBlock(node)) {
        const parent = node.parentNode;
        if (!parent) return null;
        if (node.nodeName === "TABLE" &&
            !(parent.classList && parent.classList.contains("table-responsive"))) {
          path.unshift(0);
        }
        const idx = blockChildren(parent).indexOf(node);
        if (idx < 0) return null;
        path.unshift(idx);
      }
      node = node.parentNode;
    }
    return node === root ? path : null;
  }

  // Resolve a block path against the LIVE tree (mirrors liveBlockPath's
  // wrapper rule). Returns the element or null.
  function resolveBlockPath(root, path) {
    if (!path || !path.length) return null;
    let node = root;
    for (let i = 0; i < path.length; i++) {
      const kids = blockChildren(node);
      const next = kids[path[i]];
      if (!next) return null;
      if (
        i + 1 < path.length &&
        path[i + 1] === 0 &&
        next.nodeName === "TABLE" &&
        !(node.classList && node.classList.contains("table-responsive"))
      ) {
        // Unwrapped live table: path[i+1] is the table's index inside the
        // synthetic wrapper — consume it and descend into the table itself.
        node = next;
        i++;
        continue;
      }
      node = next;
    }
    return node !== root ? node : null;
  }

  // ---- line arithmetic ----

  function lineIndex(html) {
    const starts = [0];
    for (let i = 0; i < html.length; i++) {
      if (html.charCodeAt(i) === 10) starts.push(i + 1);
    }
    // lineOf(offset) — 1-based line containing offset (start-of-line match).
    return function lineOf(offset) {
      let lo = 0,
        hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo + 1;
    };
  }

  // ---- map construction ----

  function buildSourceMap(root) {
    const clone = normalizeClone(root);
    const detail = S.prettyHTMLDetailed(clone);
    const lineOf = lineIndex(detail.html);

    const entries = [];
    const byEl = new Map();
    for (const tok of detail.tokens) {
      if (tok.type === "open") {
        const e = {
          kind: "element",
          el: tok.el,
          tag: tok.el.nodeName.toLowerCase(),
          start: tok.start,
          end: tok.end, // opening tag only ([start, end) = "<tag ...>")
          closeStart: null,
          fullEnd: tok.end, // for void/self-contained elements
          line: lineOf(tok.start),
          endLine: lineOf(tok.end),
          path: null
        };
        byEl.set(tok.el, e);
        entries.push(e);
      } else if (tok.type === "close") {
        const e = byEl.get(tok.el);
        if (e) {
          e.closeStart = tok.start;
          e.fullEnd = tok.end;
          e.endLine = lineOf(tok.end);
        }
      } else if (tok.type === "comment") {
        entries.push({
          kind: "comment",
          node: tok.node,
          start: tok.start,
          end: tok.end,
          fullEnd: tok.end,
          line: lineOf(tok.start),
          endLine: lineOf(tok.end),
          path: null
        });
      }
    }
    for (const e of entries) {
      if (e.kind === "element") e.path = liveBlockPath(clone, e.el);
    }

    const byPath = new Map();
    for (const e of entries) {
      if (e.path) byPath.set(e.path.join("/"), e);
    }

    // Innermost ELEMENT whose [start, fullEnd] contains `offset` (offsets in
    // map.html coordinates). Comments and root-level runs are skipped: when
    // the offset has no containing element, the nearest FOLLOWING element is
    // returned (flagged `following`) so reveal can target it; null past end.
    function entryForOffset(offset) {
      let best = null;
      let following = null;
      for (const e of entries) {
        if (e.kind !== "element" || !e.path) continue;
        if (e.start <= offset && offset <= e.fullEnd) {
          if (!best || e.path.length > best.path.length) best = e;
        } else if (e.start > offset) {
          if (!following || e.start < following.start) following = e;
        }
      }
      if (best) return best;
      if (following) {
        const f = Object.create(following);
        f.following = true;
        return f;
      }
      return null;
    }

    // Same, but for a caret offset in the CURRENT code text. Exact when the
    // text is the serializer's own output; otherwise the caret's trimmed line
    // is matched uniquely in the canonical html (no confident match → null).
    function entryForCodeOffset(codeText, offset) {
      if (codeText === detail.html) return entryForOffset(offset);
      const lineStart = codeText.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      let nl = codeText.indexOf("\n", offset);
      if (nl === -1) nl = codeText.length;
      const lineText = codeText.slice(lineStart, nl).trim();
      if (!lineText) return null;
      const first = detail.html.indexOf(lineText);
      if (first < 0) return null;
      if (detail.html.indexOf(lineText, first + 1) !== -1) return null; // ambiguous
      return entryForOffset(first + Math.min(offset - lineStart, lineText.length));
    }

    // Exact range for a live element, or null.
    function rangeForElement(el) {
      if (!el || !root.contains(el)) return null;
      const path = liveBlockPath(root, el);
      if (!path) return null;
      return byPath.get(path.join("/")) || null;
    }

    return {
      html: detail.html,
      entries: entries,
      byPath: byPath,
      entryForOffset: entryForOffset,
      entryForCodeOffset: entryForCodeOffset,
      rangeForElement: rangeForElement,
      resolve: (path) => resolveBlockPath(root, path)
    };
  }

  // ---- fallback matcher (hand-edited code text) ----

  // Best-effort range of `el`'s opening tag inside an arbitrary code text:
  // find the element's serialized opening tag (editor classes stripped) and
  // disambiguate duplicates by the element's ordinal among identical opening
  // tags in document order — an ordinal preserved by whitespace-only edits.
  // Returns { start, end, line } or null when not confidently found.
  function fallbackRange(codeText, root, el) {
    if (!el || !root.contains(el)) return null;
    // Mirror what the canonicalizer emits: editor-only classes stripped and
    // empty class attributes dropped (classList.remove on a classless
    // element would materialize class="" and break matching).
    const probe = el.cloneNode(false);
    if (probe.hasAttribute("class")) {
      probe.classList.remove("selected", "hovered");
      stripClassIfEmpty(probe);
    }
    const open = S.serializeOpenTag(probe);

    let ordinal = -1;
    let seen = 0;
    for (const candidate of Array.from(root.querySelectorAll(el.tagName.toLowerCase()))) {
      const c = candidate.cloneNode(false);
      if (c.hasAttribute("class")) {
        c.classList.remove("selected", "hovered");
        stripClassIfEmpty(c);
      }
      if (S.serializeOpenTag(c) === open) {
        if (candidate === el) {
          ordinal = seen;
          break;
        }
        seen++;
      }
    }
    if (ordinal < 0) return null;

    let at = -1;
    for (let i = 0; i <= ordinal; i++) {
      at = codeText.indexOf(open, at + 1);
      if (at < 0) return null;
    }
    const line = codeText.slice(0, at).split("\n").length;
    return { start: at, end: at + open.length, line: line };
  }

  // ---- shared viewport / walk helpers (used by live-view, reveal,
  // hover-link) ----

  // Innermost block element (within `root`) containing `node`, or null.
  function innermostBlockFrom(node, root) {
    while (node && node !== root) {
      if (node.nodeType === 1 && isBlock(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  // entries: [{ el, top, bottom }] in viewport coordinates, document order.
  // Returns the first entry whose bottom edge is below the viewport top (the
  // block at the top of the viewport), or null for empty/degenerate geometry.
  function pickTopAnchor(entries, viewportTop) {
    if (!entries || !entries.length) return null;
    for (const e of entries) {
      if (e.bottom > viewportTop + 1) return e;
    }
    return null;
  }

  // All block descendants of `root` in document order with viewport rects.
  // Zero-geometry environments (happy-dom) yield rects of 0 and are naturally
  // rejected by pickTopAnchor.
  function blockViewportEntries(root) {
    const out = [];
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (!isBlock(el)) continue;
      const r = el.getBoundingClientRect();
      out.push({ el: el, top: r.top, bottom: r.bottom });
    }
    return out;
  }

  S.buildSourceMap = buildSourceMap;
  S.tidyHtml = tidyHtml;
  S.isCanonical = isCanonical;
  S.fallbackRange = fallbackRange;
  S.liveBlockPath = liveBlockPath;
  S.resolveBlockPath = resolveBlockPath;
  S.innermostBlockFrom = innermostBlockFrom;
  S.pickTopAnchor = pickTopAnchor;
  S.blockViewportEntries = blockViewportEntries;
  S.stripClassIfEmpty = stripClassIfEmpty;
  S.stripEditorState = stripEditorState;
})(window.Scribe || (window.Scribe = {}));
