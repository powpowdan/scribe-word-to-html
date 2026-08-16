// Reveal: bidirectional navigation between the Live and Code views
// (view-linking spec).
//
//  - reveal in code: the Live view's caret/selection (or a remembered block)
//    -> innermost containing block -> exact source range via buildSourceMap,
//    falling back to source-map fallbackRange over hand-edited code text ->
//    the Code view scrolls to the element's opening tag and selects it.
//  - reveal in live: the Code view's caret offset -> the element whose source
//    contains it (or the nearest following one) -> the Live view scrolls to
//    the element and briefly flashes it.
//  - switch-time mapping: when focus moves between views and the leaving
//    view had a caret/selection, the counterpart position is revealed
//    automatically; otherwise the destination keeps its scroll. No confident
//    match -> stay put (never a wrong jump).
//
// The pure navigation logic (revealCodeTarget / revealLiveTarget) is exported
// for headless testing; mountReveal() wires selection memory, buttons, and
// the Alt+C shortcut.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function lineHeightOf(ta) {
    const v = parseFloat(ta.ownerDocument.defaultView.getComputedStyle(ta).lineHeight);
    return v || 16;
  }

  // Scroll the Code textarea to a source range and select the opening tag.
  // `focus` controls whether the textarea takes focus (explicit reveal) or
  // not (already receiving focus via a view switch).
  function showRangeInCode(ta, range, focus) {
    if (focus) ta.focus({ preventScroll: true });
    if (ta.setSelectionRange) ta.setSelectionRange(range.start, range.end);
    const lh = lineHeightOf(ta);
    ta.scrollTop = Math.max(0, (range.line - 1) * lh - ta.clientHeight / 2);
  }

  // Resolve a live block element to a code range: exact map first, fallback
  // matcher over the current code text. null = not confidently found.
  function revealCodeTarget(map, codeText, liveRoot, el) {
    if (!el) return null;
    const exact = map.rangeForElement(el);
    if (exact && map.html === codeText) return exact;
    return S.fallbackRange(codeText, liveRoot, el);
  }

  // Resolve a code caret offset to a live element (via the map), honoring
  // the nearest-following rule for non-rendering source. null = no target.
  function revealLiveTarget(map, codeText, offset) {
    const entry = map.entryForCodeOffset(codeText, offset);
    if (!entry || !entry.path) return null;
    return { entry: entry, el: map.resolve(entry.path) };
  }

  // Brief highlight on a Live element (reveal + hover feedback).
  function flash(el, ms) {
    if (!el || !el.classList) return;
    el.classList.add("scribe-flash");
    clearTimeout(el._scribeFlashTimer);
    el._scribeFlashTimer = setTimeout(() => {
      el.classList.remove("scribe-flash");
      if (S.stripClassIfEmpty) S.stripClassIfEmpty(el);
    }, ms || 1200);
  }

  // config: { liveView, codeView, model, toaster, locateBtn, revealLiveBtn,
  //           getMap, shortcutTarget, liveCard, codeCard, isEnabled }
  //   isEnabled — gates the passive click-to-jump only; the explicit reveal
  //   buttons and Alt+C shortcut stay active in every layout.
  function mountReveal(config) {
    config = config || {};
    const liveView = config.liveView;
    const codeView = config.codeView;
    const liveEl = liveView.element;
    const codeEl = codeView.element;
    const getMap = config.getMap || (() => S.buildSourceMap(liveEl));
    const toaster = config.toaster || null;
    const doc = liveEl.ownerDocument;
    const isEnabled = config.isEnabled || function () { return true; };

    // Position memory: the Live caret's block, kept continuously via
    // selectionchange (buttons and clicks read it).
    let lastLiveBlock = null;
    const hoverBand = config.hoverBand || null;

    function liveSelectionBlock() {
      const sel = doc.getSelection();
      if (sel && sel.anchorNode && liveEl.contains(sel.anchorNode)) {
        return S.innermostBlockFrom(sel.anchorNode, liveEl);
      }
      return null;
    }

    function onSelectionChange() {
      const el = liveSelectionBlock();
      if (el) lastLiveBlock = el;
    }

    // Commit the given view NOW so the reveal computes against the current
    // document (typing may still be inside the debounce window) and the
    // later focus-shift blur commit becomes a dedupe no-op instead of
    // clobbering the just-set Code selection with a refresh.
    function commitLiveNow() {
      if (config.model) {
        config.model.setHTML(liveView.read(), S.ChangeSource.live);
      }
    }

    function commitCodeNow() {
      if (config.model) {
        config.model.setHTML(codeView.read(), S.ChangeSource.code);
      }
    }

    function revealCardIntoView(card) {
      if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest" });
    }

    // Scroll the Code textarea so `line` sits centered (no focus/selection
    // changes — used by click-to-jump and showRangeInCode).
    function scrollCodeToLine(ta, line) {
      const lh = parseFloat(ta.ownerDocument.defaultView.getComputedStyle(ta).lineHeight) || 16;
      ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 2);
    }

    function revealInCode(auto) {
      const el = liveSelectionBlock() ||
        (lastLiveBlock && liveEl.contains(lastLiveBlock) ? lastLiveBlock : null);
      if (!el) {
        if (!auto && toaster) toaster.show("Click in the Live view text first", "info");
        return false;
      }
      commitLiveNow();
      const map = getMap();
      const r = revealCodeTarget(map, codeView.read(), liveEl, el);
      if (!r) {
        // Stay put — no confident match (view-linking spec).
        if (!auto && toaster) toaster.show("Could not locate that element in the code", "info");
        return false;
      }
      showRangeInCode(codeEl, r, !auto);
      revealCardIntoView(config.codeCard);
      return true;
    }

    function revealInLive(auto) {
      const focused = doc.activeElement === codeEl;
      const off = focused ? codeEl.selectionStart : null;
      if (off == null) {
        if (!auto && toaster) toaster.show("Click in the Code view first", "info");
        return false;
      }
      commitCodeNow();
      const map = getMap();
      const target = revealLiveTarget(map, codeView.read(), off);
      const el = target && target.el;
      if (!el || !liveEl.contains(el) || !el.scrollIntoView) {
        if (!auto && toaster) toaster.show("No rendered element at that spot", "info");
        return false;
      }
      el.scrollIntoView({ block: "center" });
      flash(el);
      revealCardIntoView(config.liveCard);
      return true;
    }

    // ---- click-to-jump (the only automatic cross-view positioning) ----
    // Clicking content in one view positions the other view at the
    // corresponding spot, without stealing focus or moving the caret.
    // Typing, arrow keys, and scrolling never move the other view.
    function onLiveClick(e) {
      if (!isEnabled()) return;
      if (!e.detail) return; // keyboard-synthesized click
      const sel = doc.getSelection();
      // A non-collapsed selection means the user is selecting text, not
      // placing the caret — not a jump.
      if (sel && !sel.isCollapsed && liveEl.contains(sel.anchorNode)) return;
      const block = liveSelectionBlock() || S.innermostBlockFrom(e.target, liveEl);
      if (!block) return;
      commitLiveNow();
      const map = getMap();
      const r = revealCodeTarget(map, codeView.read(), liveEl, block);
      if (!r) return;
      scrollCodeToLine(codeEl, r.line);
      if (codeEl.setSelectionRange) codeEl.setSelectionRange(r.start, r.end);
      if (hoverBand && hoverBand.pinBand) hoverBand.pinBand(r.line, r.endLine);
      revealCardIntoView(config.codeCard);
    }

    function onCodeClick(e) {
      if (!isEnabled()) return;
      if (!e.detail) return;
      const off = codeEl.selectionStart;
      if (off == null || off !== codeEl.selectionEnd) return; // text selection
      commitCodeNow();
      const map = getMap();
      const target = revealLiveTarget(map, codeView.read(), off);
      const el = target && target.el;
      if (!el || !liveEl.contains(el) || !el.scrollIntoView) return;
      el.scrollIntoView({ block: "center" });
      flash(el);
      revealCardIntoView(config.liveCard);
    }

    // ---- explicit affordances ----
    // mousedown is suppressed on the buttons so clicking them never moves
    // focus or clears the Live selection the reveal depends on (same trick
    // the WYSIWYG toolbar uses).
    function keepSelection(e) { e.preventDefault(); }
    function onLocateClick() { revealInCode(false); }
    function onRevealLiveClick() { revealInLive(false); }
    if (config.locateBtn) {
      config.locateBtn.addEventListener("mousedown", keepSelection);
      config.locateBtn.addEventListener("click", onLocateClick);
    }
    if (config.revealLiveBtn) {
      config.revealLiveBtn.addEventListener("mousedown", keepSelection);
      config.revealLiveBtn.addEventListener("click", onRevealLiveClick);
    }
    function onShortcut(e) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        revealInCode(false);
      }
    }
    const shortcutTarget = config.shortcutTarget || doc;
    shortcutTarget.addEventListener("keydown", onShortcut);

    // Click-to-jump listeners (mouse clicks only; e.detail === 0 is a
    // keyboard-synthesized click and is ignored).
    function isMouseClick(e) { return !!e.detail; }
    function onLiveClickJump(e) { if (isMouseClick(e)) onLiveClick(e); }
    function onCodeClickJump(e) { if (isMouseClick(e)) onCodeClick(e); }

    doc.addEventListener("selectionchange", onSelectionChange);
    liveEl.addEventListener("click", onLiveClickJump);
    codeEl.addEventListener("click", onCodeClickJump);

    return {
      revealInCode: revealInCode,
      revealInLive: revealInLive,
      detach() {
        doc.removeEventListener("selectionchange", onSelectionChange);
        liveEl.removeEventListener("click", onLiveClickJump);
        codeEl.removeEventListener("click", onCodeClickJump);
        if (config.locateBtn) {
          config.locateBtn.removeEventListener("mousedown", keepSelection);
          config.locateBtn.removeEventListener("click", onLocateClick);
        }
        if (config.revealLiveBtn) {
          config.revealLiveBtn.removeEventListener("mousedown", keepSelection);
          config.revealLiveBtn.removeEventListener("click", onRevealLiveClick);
        }
        shortcutTarget.removeEventListener("keydown", onShortcut);
      }
    };
  }

  S.reveal = {
    revealCodeTarget: revealCodeTarget,
    revealLiveTarget: revealLiveTarget,
    showRangeInCode: showRangeInCode,
    flash: flash,
    mountReveal: mountReveal
  };
})(window.Scribe || (window.Scribe = {}));
