// WYSIWYG formatting toolbar for the Live view: bold, italic, ordered/
// unordered lists, indent/outdent, block-format (p, h1-h6), create-link,
// and NBSP-for-selection.
//
// Uses document.execCommand (deprecated but universally supported) operating on
// the contentEditable selection. Button mousedown is prevented so the Live
// view's selection survives clicking the toolbar; after each command, onChange
// flushes the Live view into the document model so the Code view stays live.
//
// Indent/outdent is CONTEXT-AWARE: inside a list the native execCommand is
// correct (it nests list items); anywhere else it would wrap the block in a
// <blockquote> (Chrome's implementation), which is wrong markup for
// Canada.ca — so prose blocks instead step through the WET margin ladder
// (mrgn-lft-md -> lg -> xl), the same ladder the table toolbar uses.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // WET left-margin ladder, lowest to highest (matches table-editor.js).
  const INDENT_LEVELS = ["mrgn-lft-md", "mrgn-lft-lg", "mrgn-lft-xl"];

  const PROSE_BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,blockquote,figure,figcaption,pre";

  function exec(cmd, value) {
    if (typeof document.execCommand !== "function") return false;
    try {
      return document.execCommand(cmd, false, typeof value === "undefined" ? null : value);
    } catch (e) {
      return false;
    }
  }

  function queryState(cmd) {
    if (typeof document.queryCommandState !== "function") return false;
    try {
      return document.queryCommandState(cmd);
    } catch (e) {
      return false;
    }
  }

  // ---- Indent ladder (pure, testable) ----

  // Step one block up/down the WET margin ladder. Idempotent at both ends:
  // indent past xl and outdent below md are no-ops.
  function applyIndentToBlock(block, delta) {
    if (!block || !block.classList) return false;
    let changed = false;
    if (delta > 0) {
      if (!block.classList.contains(INDENT_LEVELS[0]) &&
          !block.classList.contains(INDENT_LEVELS[1]) &&
          !block.classList.contains(INDENT_LEVELS[2])) {
        block.classList.add(INDENT_LEVELS[0]);
        changed = true;
      } else if (block.classList.contains(INDENT_LEVELS[0])) {
        block.classList.remove(INDENT_LEVELS[0]);
        block.classList.add(INDENT_LEVELS[1]);
        changed = true;
      } else if (block.classList.contains(INDENT_LEVELS[1])) {
        block.classList.remove(INDENT_LEVELS[1]);
        block.classList.add(INDENT_LEVELS[2]);
        changed = true;
      } // already xl -> cap
    } else if (delta < 0) {
      if (block.classList.contains(INDENT_LEVELS[2])) {
        block.classList.remove(INDENT_LEVELS[2]);
        block.classList.add(INDENT_LEVELS[1]);
        changed = true;
      } else if (block.classList.contains(INDENT_LEVELS[1])) {
        block.classList.remove(INDENT_LEVELS[1]);
        block.classList.add(INDENT_LEVELS[0]);
        changed = true;
      } else if (block.classList.contains(INDENT_LEVELS[0])) {
        block.classList.remove(INDENT_LEVELS[0]);
        changed = true;
      } // no ladder class -> no-op
    }
    return changed;
  }

  // The nearest prose-block ancestor of a node, or null.
  function closestProseBlock(node, root) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    while (el && el !== root) {
      if (el.matches && el.matches(PROSE_BLOCK_SELECTOR)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Prose blocks touched by the range, in document order (start block through
  // end block inclusive). Uses document-order indexes, not boundary math.
  function proseBlocksInSelection(root, range) {
    if (!range) return [];
    const blocks = Array.from(root.querySelectorAll(PROSE_BLOCK_SELECTOR));
    const startBlock = closestProseBlock(range.startContainer, root);
    const endBlock = closestProseBlock(range.endContainer, root);
    if (!startBlock || !endBlock) return [];
    const si = blocks.indexOf(startBlock);
    const ei = blocks.indexOf(endBlock);
    if (si === -1 || ei === -1) return [];
    return blocks.slice(Math.min(si, ei), Math.max(si, ei) + 1);
  }

  // Is the node inside a list item? (Native indent is correct there.)
  function isInList(node, root) {
    let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    while (el && el !== root) {
      if (el.tagName === "LI") return true;
      el = el.parentElement;
    }
    return false;
  }

  // ---- NBSP (pure helpers, testable) ----

  function collectTextNodes(root, out) {
    out = out || [];
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out.push(child);
      else if (child.nodeType === Node.ELEMENT_NODE) collectTextNodes(child, out);
    }
    return out;
  }

  // Replace regular spaces with U+00A0 in textNode[start, end) only.
  // Returns the number of spaces replaced.
  function nbspTextNode(textNode, start, end) {
    const value = textNode.nodeValue || "";
    const s = Math.max(0, Math.min(start, value.length));
    const e = Math.max(0, Math.min(end, value.length));
    if (e <= s) return 0;
    const mid = value.slice(s, e);
    if (mid.indexOf(" ") === -1) return 0;
    const count = (mid.match(/ /g) || []).length;
    textNode.nodeValue = value.slice(0, s) + mid.replace(/ /g, "\u00A0") + value.slice(e);
    return count;
  }

  // Replace every regular space inside the range's selected text with U+00A0.
  // Handles partial text nodes at either boundary; text nodes outside the
  // start->end span (e.g. siblings after the selection end) are untouched.
  // Returns the number of replacements.
  function nbspRange(range) {
    if (!range || range.collapsed) return 0;
    const ancestor = range.commonAncestorContainer;
    const container = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor : ancestor.parentNode;
    if (!container) return 0;
    const start = { node: range.startContainer, offset: range.startOffset };
    const end = { node: range.endContainer, offset: range.endOffset };

    let total = 0;
    for (const tn of collectTextNodes(container)) {
      let s = 0;
      let e = tn.nodeValue ? tn.nodeValue.length : 0;
      if (tn === start.node || tn === end.node) {
        if (tn === start.node) s = Math.max(s, start.offset);
        if (tn === end.node) e = Math.min(e, end.offset);
      } else {
        // Strictly between the two boundary nodes in document order?
        const afterStart = start.node.compareDocumentPosition(tn) & Node.DOCUMENT_POSITION_FOLLOWING;
        const beforeEnd = end.node.compareDocumentPosition(tn) & Node.DOCUMENT_POSITION_PRECEDING;
        if (!(afterStart && beforeEnd)) continue; // outside the selection span
      }
      total += nbspTextNode(tn, s, e);
    }
    return total;
  }

  // config:
  //   liveRoot  — the contentEditable element
  //   toolbar   — element containing [data-cmd] buttons (+ optional block-select)
  //   blockSelect — the <select> for formatBlock (option values = p / h1..h6)
  //   nbspBtn   — the NBSP button (selection-scoped, like the table-cell one)
  //   onChange  — called after each command (main.js flushes Live -> model)
  //   notify    — (message, type) toast hook for guidance messages
  function mountWysiwyg(config) {
    config = config || {};
    const liveRoot = config.liveRoot;
    const toolbar = config.toolbar;
    const blockSelect = config.blockSelect;
    const nbspBtn = config.nbspBtn;
    const onChange = config.onChange || function () {};
    const notify = config.notify || function () {};

    function flush() {
      // The Live view holds the authoritative content; push it to the model so
      // the Code view reflects the formatting. (mousedown preventDefault keeps
      // focus in Live, so the normal blur-sync would not fire.)
      onChange();
    }

    function currentRange() {
      const sel = document.getSelection && document.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (liveRoot.contains(range.commonAncestorContainer)) return range;
      }
      return null;
    }

    // Context-aware indent/outdent: lists nest natively; prose uses the WET
    // margin ladder; a bare table cell defers to the table toolbar.
    function indent(delta) {
      liveRoot.focus();
      const range = currentRange();
      if (!range) return;
      if (isInList(range.startContainer, liveRoot)) {
        exec(delta > 0 ? "indent" : "outdent", null); // correct inside lists
      } else {
        const blocks = proseBlocksInSelection(liveRoot, range);
        if (!blocks.length) {
          const cell = (range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement);
          if (cell && cell.closest && cell.closest("td, th")) {
            notify("Use the table toolbar's indent for table cells", "warn");
          }
          return;
        }
        blocks.forEach((b) => applyIndentToBlock(b, delta));
      }
      flush();
      refreshActive();
      saveSelection();
    }

    function doNbsp() {
      liveRoot.focus();
      const range = currentRange();
      if (!range || range.collapsed) {
        notify("Select the text first, then click NBSP", "warn");
        return;
      }
      const count = nbspRange(range);
      if (count > 0) flush();
      saveSelection();
    }

    // Nearest enclosing <a> of the current selection, or null.
    function closestAnchor(node) {
      let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
      while (el && el !== liveRoot) {
        if (el.tagName === "A") return el;
        el = el.parentElement;
      }
      return null;
    }

    // Edit-or-create a link at the selection:
    //   • selection inside an existing <a>  → prompt pre-filled with its href
    //   • new URL entered                   → create/update the link
    //   • field cleared + OK                → remove the link (text kept)
    //   • Cancel                            → no change
    function editLink() {
      liveRoot.focus();
      const range = currentRange();
      if (!range) return;
      const anchor = closestAnchor(range.startContainer);
      const existing = anchor ? anchor.getAttribute("href") || "" : "";
      const url = window.prompt("Link URL (clear to remove the link):", existing || "https://");
      if (url === null) return; // cancelled
      if (anchor && !url.trim()) {
        anchor.replaceWith(...Array.from(anchor.childNodes));
        flush();
        refreshActive();
        saveSelection();
        return;
      }
      if (!url.trim()) return; // nothing to create
      if (anchor) {
        anchor.setAttribute("href", url.trim()); // edit in place
      } else {
        exec("createLink", url.trim());
      }
      flush();
      refreshActive();
      saveSelection();
    }

    function runCommand(cmd) {
      liveRoot.focus();
      if (cmd === "indent") {
        indent(1);
        return;
      }
      if (cmd === "outdent") {
        indent(-1);
        return;
      }
      if (cmd === "createLink") {
        editLink();
        return;
      }
      exec(cmd, null);
      flush();
      refreshActive();
    }

    if (toolbar) {
      toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
        // Prevent the selection from collapsing when the toolbar is clicked.
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => runCommand(btn.getAttribute("data-cmd")));
      });
    }

    if (nbspBtn) {
      nbspBtn.addEventListener("mousedown", (e) => e.preventDefault());
      nbspBtn.addEventListener("click", doNbsp);
    }

    // Track the Live view's last selection so toolbar controls can restore it.
    // (Clicking a <select> blurs the Live view and can drop the caret; buttons
    // keep it via mousedown preventDefault, but a select must open natively.)
    let savedRange = null;
    function saveSelection() {
      const sel = document.getSelection && document.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        if (liveRoot.contains(range.commonAncestorContainer)) {
          savedRange = range.cloneRange();
        }
      }
    }
    function restoreSelection() {
      if (!savedRange) return false;
      const sel = window.getSelection && window.getSelection();
      if (!sel) return false;
      liveRoot.focus();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    }

    if (blockSelect) {
      blockSelect.addEventListener("change", () => {
        const val = blockSelect.value;
        if (!val) return;
        // Restore the caret the dropdown click may have dropped.
        restoreSelection();
        if (val === "small") {
          // Small text is a class toggle on the current block, not a
          // formatBlock — the element type stays whatever it is.
          liveRoot.focus();
          const range = currentRange();
          const block = range ? closestProseBlock(range.startContainer, liveRoot) : null;
          if (block) {
            block.classList.toggle("small");
            flush();
            saveSelection();
          }
        } else {
          // formatBlock wants a tag name; browsers accept "h2" or "<h2>".
          exec("formatBlock", val.startsWith("<") ? val : "<" + val + ">");
          flush();
          refreshActive();
          saveSelection();
        }
        blockSelect.value = ""; // reset so the same format can be re-applied later
      });
    }

    function refreshActive() {
      if (!toolbar) return;
      toolbar.querySelectorAll("[data-cmd]").forEach((btn) => {
        const cmd = btn.getAttribute("data-cmd");
        if (cmd === "bold" || cmd === "italic") {
          btn.classList.toggle("active", queryState(cmd));
          btn.setAttribute("aria-pressed", String(queryState(cmd)));
        }
      });
    }

    // Refresh active state + track the selection as the caret moves.
    function onSelectionActivity() {
      saveSelection();
      refreshActive();
    }
    document.addEventListener("selectionchange", onSelectionActivity);
    liveRoot.addEventListener("keyup", onSelectionActivity);
    liveRoot.addEventListener("mouseup", onSelectionActivity);

    return {
      refreshActive,
      runCommand,
      saveSelection,
      restoreSelection,
      detach() {
        document.removeEventListener("selectionchange", onSelectionActivity);
      }
    };
  }

  S.wysiwyg = {
    mountWysiwyg,
    exec,
    queryState,
    // pure helpers (headlessly tested)
    INDENT_LEVELS,
    applyIndentToBlock,
    closestProseBlock,
    proseBlocksInSelection,
    isInList,
    collectTextNodes,
    nbspTextNode,
    nbspRange
  };
})(window.Scribe || (window.Scribe = {}));
