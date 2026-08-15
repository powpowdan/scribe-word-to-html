// Hover linking (view-linking spec): hovering an element in the Live view
// highlights its source lines in the Code view (a translucent band on the
// decorative overlay area), and hovering source text in the Code view
// highlights the corresponding element in the Live view. Purely transient —
// never touches the caret, selection, scroll, or the document model.
//
// Line arithmetic relies on the code panes' shared monospace metrics
// (font/size/line-height match between the textarea and the overlay; the
// highlight overlay already depends on this).
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function metricsOf(ta) {
    const cs = ta.ownerDocument.defaultView.getComputedStyle(ta);
    return {
      lh: parseFloat(cs.lineHeight) || 16,
      padTop: parseFloat(cs.paddingTop) || 0
    };
  }

  // Pure: viewport Y (clientY-relative) + scrollTop -> 1-based code line.
  function lineAtY(ta, y) {
    const m = metricsOf(ta);
    return Math.max(1, Math.floor((y - m.padTop) / m.lh) + 1);
  }

  // Pure: band placement for lines [line, endLine] given the textarea scroll.
  function bandPlacement(ta, line, endLine) {
    const m = metricsOf(ta);
    return {
      top: m.padTop + (line - 1) * m.lh - ta.scrollTop,
      height: Math.max(1, endLine - line + 1) * m.lh
    };
  }

  // A "pure container" is a block element whose children are exclusively
  // block elements (plus insignificant whitespace): wrapper divs, ul/ol,
  // table/tbody/tr, sections... Its own box is exactly the union of its
  // children plus the inter-item gaps, so a hover targeting it means the
  // pointer is in background space between content — not on content.
  function isPureContainer(el) {
    if (!el || el.nodeType !== 1 || !S.isBlockElement(el)) return false;
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) {
        if (c.nodeValue && c.nodeValue.trim()) return false; // real text run
        continue;
      }
      if (c.nodeType === Node.COMMENT_NODE) continue;
      if (c.nodeType !== 1) return false;
      if (!S.isBlockElement(c)) return false; // inline element = content
    }
    return true;
  }

  // config: { liveView, codeView, band, getMap }
  //   band — absolutely-positioned overlay element inside .code-input-wrap
  //          (pointer-events: none) used to outline source lines.
  function mountHoverLink(config) {
    config = config || {};
    const liveEl = config.liveView ? config.liveView.element : null;
    const codeEl = config.codeView ? config.codeView.element : null;
    const band = config.band || null;
    const getMap = config.getMap || (liveEl ? () => S.buildSourceMap(liveEl) : () => null);

    let hoveredLiveEl = null; // Live element carrying the highlight class
    let lastBand = null;      // { line, endLine } currently outlined
    let pinned = null;        // { line, endLine } click-to-jump anchor band

    function clearLiveClass() {
      if (hoveredLiveEl) {
        hoveredLiveEl.classList.remove("scribe-hover-linked");
        if (S.stripClassIfEmpty) S.stripClassIfEmpty(hoveredLiveEl);
        hoveredLiveEl = null;
      }
    }

    function hideBand() {
      // A hover ending (leave / background) restores the pinned anchor if
      // one exists — the panes keep showing a matched position.
      if (pinned) {
        showBand(pinned.line, pinned.endLine, true);
        return;
      }
      lastBand = null;
      if (band) band.hidden = true;
    }

    function showBand(line, endLine, isPinned) {
      if (!band) return;
      lastBand = { line: line, endLine: endLine };
      const p = bandPlacement(codeEl, line, endLine);
      band.hidden = false;
      band.classList.toggle("pinned", !!isPinned);
      band.style.top = p.top + "px";
      band.style.height = p.height + "px";
    }

    // Click-to-jump anchor: the band persists on the jumped-to lines until
    // the next jump (hover temporarily overrides it, then restores).
    function pinBand(line, endLine) {
      pinned = { line: line, endLine: endLine };
      showBand(line, endLine, true);
    }

    function clearPin() {
      pinned = null;
    }

    // Keep the band glued to the text while the code pane scrolls.
    function onCodeScroll() {
      if (!lastBand || !band) return;
      const p = bandPlacement(codeEl, lastBand.line, lastBand.endLine);
      band.style.top = p.top + "px";
      band.style.height = p.height + "px";
    }

    // ---- Live -> Code ----
    function onLiveOver(e) {
      const node = e.target;
      if (!node || node.nodeType !== 1) return;
      // The surface's own padding/gaps: nothing under the pointer means
      // nothing highlighted.
      if (node === liveEl) {
        clearLiveClass();
        hideBand();
        return;
      }
      const block = S.innermostBlockFrom(node, liveEl);
      if (!block) return;
      if (isPureContainer(block)) {
        // Background space between items — clear immediately.
        clearLiveClass();
        hideBand();
        return;
      }
      if (block === hoveredLiveEl) return; // same block, nothing to update
      const map = getMap();
      const r = map && (map.rangeForElement(block) ||
        S.fallbackRange(codeEl.value, liveEl, block));
      clearLiveClass();
      if (!r) return;
      hoveredLiveEl = block;
      block.classList.add("scribe-hover-linked");
      showBand(r.line, r.endLine);
    }

    function onLiveOut(e) {
      // Only clear when the pointer actually leaves the surface (not just
      // moving between the surface's own children).
      if (e.relatedTarget && liveEl.contains(e.relatedTarget)) return;
      clearLiveClass();
      hideBand();
    }

    // ---- Code -> Live ----
    function onCodeMove(e) {
      const rect = codeEl.getBoundingClientRect();
      const y = e.clientY - rect.top + codeEl.scrollTop;
      const line = lineAtY(codeEl, y);
      const off = S.codeViewTools.lineStartOffset(codeEl.value, line);
      if (off < 0) return;
      const map = getMap();
      const entry = map && map.entryForCodeOffset(codeEl.value, off);
      const el = entry && entry.path ? map.resolve(entry.path) : null;
      if (el && el !== hoveredLiveEl) {
        clearLiveClass();
        hoveredLiveEl = el;
        el.classList.add("scribe-hover-linked");
      } else if (!el && hoveredLiveEl) {
        clearLiveClass();
      }
    }

    function onCodeLeave() {
      clearLiveClass();
    }

    function onLiveLeave() {
      clearLiveClass();
      hideBand();
    }

    if (liveEl) {
      liveEl.addEventListener("mouseover", onLiveOver);
      liveEl.addEventListener("mouseout", onLiveOut);
      liveEl.addEventListener("mouseleave", onLiveLeave);
    }
    if (codeEl) {
      codeEl.addEventListener("mousemove", onCodeMove);
      codeEl.addEventListener("mouseleave", onCodeLeave);
      codeEl.addEventListener("scroll", onCodeScroll);
    }

    return {
      clearLiveClass: clearLiveClass,
      hideBand: hideBand,
      pinBand: pinBand,
      clearPin: clearPin,
      detach() {
        if (liveEl) {
          liveEl.removeEventListener("mouseover", onLiveOver);
          liveEl.removeEventListener("mouseout", onLiveOut);
          liveEl.removeEventListener("mouseleave", onLiveLeave);
        }
        if (codeEl) {
          codeEl.removeEventListener("mousemove", onCodeMove);
          codeEl.removeEventListener("mouseleave", onCodeLeave);
          codeEl.removeEventListener("scroll", onCodeScroll);
        }
      }
    };
  }

  S.hoverLink = {
    lineAtY: lineAtY,
    bandPlacement: bandPlacement,
    isPureContainer: isPureContainer,
    mountHoverLink: mountHoverLink
  };
})(window.Scribe || (window.Scribe = {}));
