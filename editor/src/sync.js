// Continuous focus-based synchronization between Live and Code views.
//
// The view holding keyboard focus is the writer: its 'input' events are
// debounced into model.setHTML(..., source=<view>). The follower view
// re-renders from the model on every emit (scroll-anchored — see code-view.js
// / live-view.js) without waiting for a focus change. Feedback loops are
// impossible by construction: programmatic value changes fire no 'input', and
// each view skips model changes it originated (ChangeSource).
//
// Blur is demoted to a flush: pending debounced edits commit immediately, so
// the destination view always refreshes from the committed document on a
// focus switch (view-linking/reveal modules hook that moment to map the
// editing position across views). Code-view commits optionally pass through
// the canonical pretty-printer ("tidy on commit", default off, decided by the
// caller via isTidyOnCommit) — applied at flush time only, never mid-typing.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function wireSync(liveView, codeView, model, refs, opts) {
    const ChangeSource = refs.ChangeSource;
    const codeEl = codeView.element;
    const liveEl = liveView.element;
    opts = opts || {};

    const debounceMs = opts.debounceMs == null ? 250 : opts.debounceMs;
    const isTidyOn = opts.isTidyOnCommit || function () { return false; };
    // Timer functions are injectable so headless tests can drive the debounce
    // deterministically (vitest fake timers against this happy-dom window).
    const setTimeoutFn = opts.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    const clearTimeoutFn = opts.clearTimeout || function (id) { clearTimeout(id); };

    let timer = null;
    let pendingSource = null;

    function commitLive() {
      model.setHTML(liveView.read(), ChangeSource.live);
    }

    // `commit` marks a focus-boundary flush (blur / focus switch / explicit
    // flush): the user's editing burst is over, so the optional canonical
    // tidy pass may run and rewrite the Code view. Debounce-tick commits
    // (user still typing in Code) never tidy — rewriting the textarea
    // mid-typing would move the caret.
    function commitCode(commit) {
      let text = codeView.read();
      if (commit && isTidyOn() && S.tidyHtml) {
        const tidy = S.tidyHtml(text);
        if (tidy !== text) {
          text = tidy;
          // Reflect the canonical text back into the Code view (gutter and
          // highlight overlay refresh via the scribe:code-write signal).
          codeView.write(text);
        }
      }
      model.setHTML(text, ChangeSource.code);
    }

    // Flush any pending debounced edit. `commit` (default true) marks a
    // focus-boundary flush; the debounce timer calls it with false.
    // Idempotent: safe to call from both blur and focusin handlers.
    function flushNow(commit) {
      if (!pendingSource) return;
      const src = pendingSource;
      pendingSource = null;
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      if (src === ChangeSource.live) commitLive();
      else commitCode(commit !== false);
    }

    // Blur commits the view's current content unconditionally (the v1
    // refresh-on-blur contract): reads the view, writes the model (which
    // dedupes unchanged values). Programmatic content changes that fired no
    // 'input' (some test/extension paths) still commit this way.
    function commitFrom(source) {
      pendingSource = null;
      if (timer !== null) {
        clearTimeoutFn(timer);
        timer = null;
      }
      if (source === ChangeSource.live) commitLive();
      else commitCode(true);
    }

    function onLiveBlur() { commitFrom(ChangeSource.live); }
    function onCodeBlur() { commitFrom(ChangeSource.code); }
    function onLiveFocusIn() { flushNow(true); }
    function onCodeFocusIn() { flushNow(true); }

    function schedule(source) {
      pendingSource = source;
      if (timer !== null) clearTimeoutFn(timer);
      timer = setTimeoutFn(function () { flushNow(false); }, debounceMs);
    }

    function onLiveInput() { schedule(ChangeSource.live); }
    function onCodeInput() { schedule(ChangeSource.code); }

    liveEl.addEventListener("input", onLiveInput);
    codeEl.addEventListener("input", onCodeInput);

    // Focus moves flush the leaving view FIRST (blur fires before the
    // destination's focusin in browsers; the focusin flush is belt-and-braces
    // for programmatic focus), so the destination refreshes from committed
    // content and reveal mapping (reveal.js) sees a current model.
    liveEl.addEventListener("blur", onLiveBlur);
    codeEl.addEventListener("blur", onCodeBlur);
    liveEl.addEventListener("focusin", onLiveFocusIn);
    codeEl.addEventListener("focusin", onCodeFocusIn);

    return {
      flush: function () { flushNow(true); },
      detach() {
        if (timer !== null) clearTimeoutFn(timer);
        timer = null;
        pendingSource = null;
        liveEl.removeEventListener("input", onLiveInput);
        codeEl.removeEventListener("input", onCodeInput);
        liveEl.removeEventListener("blur", onLiveBlur);
        codeEl.removeEventListener("blur", onCodeBlur);
        liveEl.removeEventListener("focusin", onLiveFocusIn);
        codeEl.removeEventListener("focusin", onCodeFocusIn);
      }
    };
  }

  S.wireSync = wireSync;
})(window.Scribe || (window.Scribe = {}));
