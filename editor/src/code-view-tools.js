// Code-view power features: line numbers, find/replace (with regex), and
// go-to-line. The pure logic (matching, replacement, navigation) is exported
// for headless testing; mountCodeViewTools() wires it to the textarea + a
// find panel + a line-number gutter.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // ===========================================================================
  // PURE LOGIC  (unit-tested)
  // ===========================================================================

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Returns a RegExp for the query (literal or regex), or null if the query is
  // empty / an invalid regex. Always global so we can iterate.
  function buildMatcher(query, opts) {
    opts = opts || {};
    if (!query) return null;
    const flags = opts.caseSensitive ? "g" : "gi";
    let src;
    if (opts.regex) {
      try {
        // validate
        new RegExp(query);
      } catch (e) {
        return null;
      }
      src = query;
    } else {
      src = escapeRegExp(query);
    }
    return new RegExp(src, flags);
  }

  // All match ranges in text for the query. Each item: { start, end, match }.
  function findAllMatches(text, query, opts) {
    const re = buildMatcher(query, opts);
    if (!re) return [];
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        // Avoid infinite loop on zero-length matches (e.g. regex `a*`).
        re.lastIndex++;
        continue;
      }
      out.push({ start: m.index, end: m.index + m[0].length, match: m[0] });
    }
    return out;
  }

  // Index of the next match at or after `pos`; wraps to 0. -1 if no matches.
  function nextMatchIndex(matches, pos) {
    if (!matches.length) return -1;
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].start >= pos) return i;
    }
    return 0;
  }

  // Index of the previous match strictly before `pos`; wraps to last. -1 if none.
  function prevMatchIndex(matches, pos) {
    if (!matches.length) return -1;
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].start < pos) return i;
    }
    return matches.length - 1;
  }

  // Substitute $1..$99 backreferences (longest digit run wins: "$12" is
  // group 12, not group 1 + "2") in `replacement` using a full regex exec
  // result. Undefined groups leave the reference literal.
  function applyBackreferences(replacement, execResult) {
    if (!execResult || execResult.length <= 1) return replacement;
    return replacement.replace(/\$(\d+)/g, (full, n) => {
      const i = parseInt(n, 10);
      return execResult[i] !== undefined ? execResult[i] : full;
    });
  }

  // Wrap the selection [start, end) in an element described by `spec`
  // ("figure", 'figure class="fig"', …). Returns { value, start, end } with
  // the selection preserved on the wrapped content, or null when the spec
  // is not a valid tag (caller no-ops).
  function wrapSelection(value, start, end, spec) {
    const m = /^\s*([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)\s*$/.exec(String(spec == null ? "" : spec));
    if (!m) return null;
    const attrs = m[2].trim();
    // Reject specs with angle brackets or a stray ">" — those would produce
    // unbalanced markup.
    if (/[<>]/.test(attrs)) return null;
    const open = "<" + m[1] + (attrs ? " " + attrs : "") + ">";
    const close = "</" + m[1] + ">";
    const next =
      value.slice(0, start) + open + value.slice(start, end) + close + value.slice(end);
    return { value: next, start, end };
  }

  // Indent ("in") or outdent ("out") every line intersecting the selection
  // by 4 spaces; outdent removes up to 4 leading spaces per line (partial
  // runs dedent by what remains). With no selection: "in" inserts 4 spaces
  // at the caret; "out" dedents the caret's line. With a selection the
  // result covers the whole transformed block of lines.
  function indentSelection(value, start, end, mode) {
    const IND = "    ";
    const lineStartOf = (pos) => value.lastIndexOf("\n", Math.max(0, pos - 1)) + 1;
    const lineEndOf = (pos) => {
      const nl = value.indexOf("\n", pos);
      return nl === -1 ? value.length : nl;
    };

    if (start === end) {
      if (mode === "in") {
        return {
          value: value.slice(0, start) + IND + value.slice(start),
          start: start + IND.length,
          end: start + IND.length
        };
      }
      // Outdent the caret's line; the caret follows the removed spaces
      // (never moves before the line start).
      const ls = lineStartOf(start);
      const le = lineEndOf(start);
      const removed = /^ {1,4}/.exec(value.slice(ls, le));
      const cut = removed ? removed[0].length : 0;
      if (!cut) return { value, start, end };
      const next = value.slice(0, ls) + value.slice(ls + cut, le) + value.slice(le);
      const pos = Math.max(ls, start - Math.min(start - ls, cut));
      return { value: next, start: pos, end: pos };
    }

    // Lines intersecting the selection = the line of `start` through the line
    // containing the last selected character (end - 1). The block includes
    // the final line's terminating newline when present.
    const selStart = lineStartOf(start);
    const lastLineEnd = lineEndOf(Math.max(selStart, end - 1));
    const blockEnd = lastLineEnd < value.length ? lastLineEnd + 1 : lastLineEnd;
    const block = value.slice(selStart, blockEnd);
    const hadNl = block.endsWith("\n");
    const lines = (hadNl ? block.slice(0, -1) : block).split("\n");
    let delta = 0;
    const outLines = lines.map((line) => {
      if (mode === "in") {
        delta += IND.length;
        return IND + line;
      }
      const removed = /^ {1,4}/.exec(line);
      if (removed) {
        delta -= removed[0].length;
        return line.slice(removed[0].length);
      }
      return line;
    });
    const outBlock = outLines.join("\n") + (hadNl ? "\n" : "");
    return {
      value: value.slice(0, selStart) + outBlock + value.slice(blockEnd),
      start: selStart,
      end: blockEnd + delta
    };
  }

  // Re-run the matcher at a position to capture groups (for backreferences).
  function execAt(text, query, opts, position) {
    const re = buildMatcher(query, opts);
    if (!re) return null;
    re.lastIndex = position;
    return re.exec(text);
  }

  // Replace the match at matchIndex. Returns { text, count, newMatchStart }.
  function replaceOneAt(text, query, replacement, opts, matchIndex) {
    const matches = findAllMatches(text, query, opts);
    if (matchIndex < 0 || matchIndex >= matches.length) {
      return { text, count: 0, newMatchStart: -1 };
    }
    const m = matches[matchIndex];
    const exec = execAt(text, query, opts, m.start);
    const rep = applyBackreferences(replacement, exec);
    const next = text.slice(0, m.start) + rep + text.slice(m.end);
    return { text: next, count: 1, newMatchStart: m.start };
  }

  // Replace every match. Returns { text, count }.
  function replaceAll(text, query, replacement, opts) {
    const matches = findAllMatches(text, query, opts);
    if (!matches.length) return { text, count: 0 };
    // Build from right to left so indices stay valid; compute per-match
    // backreferences via execAt on the ORIGINAL text (groups don't shift).
    let out = text;
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const exec = execAt(text, query, opts, m.start);
      const rep = applyBackreferences(replacement, exec);
      out = out.slice(0, m.start) + rep + out.slice(m.end);
    }
    return { text: out, count: matches.length };
  }

  function lineCount(text) {
    if (text.length === 0) return 1;
    return text.split("\n").length;
  }

  // Character offset of the start of a 1-based line number. -1 if out of range.
  function lineStartOffset(text, line) {
    const n = lineCount(text);
    if (line < 1 || line > n) return -1;
    if (line === 1) return 0;
    let pos = 0;
    let remaining = line - 1;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        remaining--;
        if (remaining === 0) return i + 1;
      }
    }
    return pos;
  }

  // Build the gutter text ("1\n2\n...N") for the given number of lines.
  function gutterText(lines) {
    let out = "";
    for (let i = 1; i <= lines; i++) {
      out += (i === 1 ? "" : "\n") + i;
    }
    return out;
  }

  // ===========================================================================
  // MOUNT  (UI wiring)
  // ===========================================================================

  // config:
  //   textarea       — the #codeView textarea
  //   gutter         — element that displays line numbers
  //   findPanel      — the find/replace panel (hidden until Ctrl+F)
  //   findInput, replaceInput, replaceRow
  //   regexToggleBtn, prevBtn, nextBtn, replaceBtn, replaceAllBtn, closeBtn,
  //   replaceToggleBtn (expand/collapse replace row)
  //   statusEl       — "x of y" match indicator
  //   goToLineBtn    — opens a go-to-line prompt
  function mountCodeViewTools(config) {
    const ta = config.textarea;
    const gutter = config.gutter;
    const findPanel = config.findPanel;
    const findInput = config.findInput;
    const replaceInput = config.replaceInput;
    const replaceRow = config.replaceRow;
    const statusEl = config.statusEl;
    const refs = config;

    let regexMode = false;
    let caseSensitive = false;
    let matches = [];
    let currentIdx = -1;

    function query() {
      return findInput ? findInput.value : "";
    }
    function replacement() {
      return replaceInput ? replaceInput.value : "";
    }

    // ----- Line numbers -----
    function refreshGutter() {
      if (!gutter) return;
      const n = lineCount(ta.value);
      const want = gutterText(n);
      if (gutter.textContent !== want) gutter.textContent = want;
    }
    function syncScroll() {
      if (gutter) gutter.scrollTop = ta.scrollTop;
    }

    // ----- Find -----
    // recompute() updates the match list + status only. It must NOT steal focus
    // from the find input (typing in the find box triggers this on every
    // keystroke). Showing/selecting the current match in the textarea is
    // reserved for showCurrentMatch(), called by explicit nav (next/prev/open).
    function recompute(fromUserTyping) {
      matches = findAllMatches(ta.value, query(), { regex: regexMode, caseSensitive });
      if (matches.length) {
        const pos = fromUserTyping ? ta.selectionStart : (matches[currentIdx] ? matches[currentIdx].start : 0);
        currentIdx = nextMatchIndex(matches, pos);
      } else {
        currentIdx = -1;
      }
      paintStatus();
    }

    function paintStatus() {
      if (!statusEl) return;
      if (!query()) {
        statusEl.textContent = "";
        return;
      }
      if (!matches.length) {
        statusEl.textContent = "0 of 0";
        return;
      }
      statusEl.textContent = currentIdx + 1 + " of " + matches.length;
    }

    // Select the current match in the textarea and scroll it into view.
    // `focusTa` controls whether the textarea takes focus (true for explicit
    // next/prev; false when we want to preserve focus elsewhere).
    function showCurrentMatch(focusTa) {
      if (currentIdx < 0 || !matches[currentIdx]) return;
      const m = matches[currentIdx];
      if (focusTa) ta.focus({ preventScroll: true });
      ta.setSelectionRange(m.start, m.end);
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 16;
      const lineNum = ta.value.substring(0, m.start).split("\n").length;
      ta.scrollTop = Math.max(0, (lineNum - 1) * lineHeight - ta.clientHeight / 2);
    }

    function go(delta) {
      if (!matches.length) return;
      const cur = matches[currentIdx] ? matches[currentIdx].start : 0;
      currentIdx = delta > 0 ? nextMatchIndex(matches, cur + 1) : prevMatchIndex(matches, cur);
      paintStatus();
      showCurrentMatch(true);
    }

    function openFind(withReplace) {
      if (!findPanel) return;
      findPanel.hidden = false;
      if (withReplace && replaceRow) replaceRow.hidden = false;
      if (findInput) {
        findInput.focus();
        findInput.select();
      }
      recompute(false);
    }
    function closeFind() {
      if (!findPanel) return;
      findPanel.hidden = true;
      ta.focus();
    }

    function doReplace() {
      if (currentIdx < 0) return;
      const before = ta.value;
      const r = replaceOneAt(before, query(), replacement(), { regex: regexMode, caseSensitive }, currentIdx);
      if (r.count) {
        ta.value = r.text;
        // Move caret just past the replacement and recompute matches.
        ta.setSelectionRange(r.newMatchStart + replacement().length, r.newMatchStart + replacement().length);
        afterTextChange();
      }
    }
    function doReplaceAll() {
      const r = replaceAll(ta.value, query(), replacement(), { regex: regexMode, caseSensitive });
      if (r.count) {
        ta.value = r.text;
        afterTextChange();
        if (statusEl) statusEl.textContent = r.count + " replaced";
      }
    }

    // Called whenever the textarea content changes via these tools.
    function afterTextChange() {
      refreshGutter();
      syncScroll();
      // Re-run matches so highlights stay accurate.
      matches = findAllMatches(ta.value, query(), { regex: regexMode, caseSensitive });
      currentIdx = matches.length ? Math.min(currentIdx, matches.length - 1) : -1;
      paintStatus();
      // Notify the editor so the document model can update (blur-sync will also
      // catch this, but this keeps the Live view live).
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // ----- Go to line -----
    function promptGoToLine() {
      const total = lineCount(ta.value);
      const input = window.prompt("Go to line (1-" + total + "):");
      if (input === null) return;
      const line = parseInt(input.trim(), 10);
      if (!Number.isFinite(line)) return;
      const off = lineStartOffset(ta.value, line);
      if (off < 0) {
        window.alert("Line " + line + " does not exist (1-" + total + ").");
        return;
      }
      ta.focus();
      ta.setSelectionRange(off, off);
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 16;
      ta.scrollTop = Math.max(0, (line - 1) * lineHeight - ta.clientHeight / 2);
    }

    // ----- Event wiring -----
    ta.addEventListener("input", refreshGutter);
    ta.addEventListener("input", syncScroll);
    // Programmatic writes from the document model (paste, commands) dispatch
    // this signal — without it the gutter would go stale after a paste.
    ta.addEventListener("scribe:code-write", refreshGutter);
    ta.addEventListener("scribe:code-write", syncScroll);
    ta.addEventListener("scroll", syncScroll);
    if (findInput) findInput.addEventListener("input", () => recompute(true));
    if (refs.regexToggleBtn) {
      refs.regexToggleBtn.addEventListener("click", () => {
        regexMode = !regexMode;
        refs.regexToggleBtn.classList.toggle("active", regexMode);
        refs.regexToggleBtn.setAttribute("aria-pressed", String(regexMode));
        recompute(false);
      });
    }
    if (refs.prevBtn) refs.prevBtn.addEventListener("click", () => go(-1));
    if (refs.nextBtn) refs.nextBtn.addEventListener("click", () => go(1));
    if (refs.replaceBtn) refs.replaceBtn.addEventListener("click", doReplace);
    if (refs.replaceAllBtn) refs.replaceAllBtn.addEventListener("click", doReplaceAll);
    if (refs.closeBtn) refs.closeBtn.addEventListener("click", closeFind);
    if (refs.replaceToggleBtn) {
      refs.replaceToggleBtn.addEventListener("click", () => {
        if (!replaceRow) return;
        replaceRow.hidden = !replaceRow.hidden;
        refs.replaceToggleBtn.setAttribute("aria-expanded", String(!replaceRow.hidden));
      });
    }
    if (refs.goToLineBtn) refs.goToLineBtn.addEventListener("click", promptGoToLine);

    // Keyboard shortcuts.
    ta.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        openFind(e.shiftKey);
        return;
      }
      if (mod && (e.key === "g" || e.key === "G")) {
        e.preventDefault();
        promptGoToLine();
        return;
      }
      if (e.key === "Escape" && findPanel && !findPanel.hidden) {
        closeFind();
      }
      if (findPanel && !findPanel.hidden && mod && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        if (replaceRow) replaceRow.hidden = false;
      }
      // Block indent/outdent — Tab always acts on the code (never moves
      // focus); find/replace inputs keep normal Tab (listener is on ta only).
      if (e.key === "Tab" && !mod) {
        e.preventDefault();
        const r = indentSelection(ta.value, ta.selectionStart, ta.selectionEnd, e.shiftKey ? "out" : "in");
        ta.value = r.value;
        ta.setSelectionRange(r.start, r.end);
        afterTextChange();
        return;
      }
      // Wrap selection with a prompted tag (name + optional attributes).
      if (e.altKey && !mod && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        const spec = window.prompt("Wrap selection with tag (name + optional attributes):", "");
        if (!spec || !spec.trim()) return; // cancel / empty = no-op
        const r = wrapSelection(ta.value, ta.selectionStart, ta.selectionEnd, spec);
        if (!r) {
          window.alert("Invalid tag specification.");
          return;
        }
        ta.value = r.value;
        ta.setSelectionRange(r.start, r.end);
        afterTextChange();
        return;
      }
    });
    if (findPanel) {
      findPanel.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeFind();
        if (e.key === "Enter") {
          e.preventDefault();
          e.shiftKey ? go(-1) : go(1);
        }
      });
    }

    // Initial paint.
    refreshGutter();

    return { refreshGutter, recompute, openFind, closeFind };
  }

  // ===========================================================================
  // EXPORTS
  // ===========================================================================

  S.codeViewTools = {
    // pure logic
    escapeRegExp,
    buildMatcher,
    findAllMatches,
    nextMatchIndex,
    prevMatchIndex,
    applyBackreferences,
    wrapSelection,
    indentSelection,
    replaceOneAt,
    replaceAll,
    lineCount,
    lineStartOffset,
    gutterText,
    // mount
    mountCodeViewTools
  };
})(window.Scribe || (window.Scribe = {}));
