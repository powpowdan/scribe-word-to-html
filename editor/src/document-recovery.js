// Document recovery: debounced autosave of the working document to browser
// local storage, with a restore prompt on next load (restore / dismiss /
// discard). The copy never leaves the browser.
//
// Pure logic (record serialize/parse, shouldPrompt) is exported for headless
// testing; createRecovery() wires it to a document model and a storage.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  const RECOVERY_VERSION = 1;
  const DEFAULT_KEY = "scribe.recovery.v1";
  const DEFAULT_DEBOUNCE_MS = 800;

  function serializeRecord(html, savedAt) {
    return JSON.stringify({
      v: RECOVERY_VERSION,
      html: String(html == null ? "" : html),
      savedAt: typeof savedAt === "number" ? savedAt : Date.now()
    });
  }

  // Returns the parsed record or null if missing / wrong version / malformed.
  function parseRecord(str) {
    if (!str) return null;
    let r;
    try {
      r = JSON.parse(str);
    } catch (e) {
      return null;
    }
    if (!r || r.v !== RECOVERY_VERSION) return null;
    if (typeof r.html !== "string") return null;
    if (typeof r.savedAt !== "number" || !Number.isFinite(r.savedAt)) return null;
    return r;
  }

  // Prompt only when the recovery is non-empty and differs from the current
  // document. (On a fresh load the current HTML is "", so any non-empty
  // recovery prompts.)
  function shouldPrompt(recovery, currentHtml) {
    if (!recovery) return false;
    if (!recovery.html || !recovery.html.trim()) return false;
    if (recovery.html === currentHtml) return false;
    return true;
  }

  // config:
  //   storage    — localStorage-like object (default: global localStorage)
  //   key        — storage key (default DEFAULT_KEY)
  //   model      — DocumentModel to observe
  //   debounceMs — autosave debounce (default DEFAULT_DEBOUNCE_MS)
  //   timer      — { setTimeout, clearTimeout } (default: globals; inject for tests)
  function createRecovery(config) {
    config = config || {};
    const storage = config.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const key = config.key || DEFAULT_KEY;
    const model = config.model;
    const debounceMs = config.debounceMs == null ? DEFAULT_DEBOUNCE_MS : config.debounceMs;
    const timer = config.timer || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { return clearTimeout(id); }
    };

    let pending = null;

    function readStored() {
      if (!storage) return null;
      return parseRecord(storage.getItem(key));
    }
    function save(html) {
      if (!storage) return false;
      try {
        storage.setItem(key, serializeRecord(html, Date.now()));
        return true;
      } catch (e) {
        // Quota exceeded / disabled storage — fail quietly; recovery is best-effort.
        return false;
      }
    }
    function discard() {
      if (!storage) return;
      try {
        storage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    }
    function start() {
      if (!model || typeof model.subscribe !== "function") return;
      model.subscribe(function (html) {
        if (pending) timer.clearTimeout(pending);
        pending = timer.setTimeout(function () {
          pending = null;
          save(html);
        }, debounceMs);
      });
    }

    return {
      start,
      save,
      discard,
      getStored: readStored,
      shouldPrompt: function (currentHtml) {
        return shouldPrompt(readStored(), currentHtml);
      },
      get pending() {
        return pending !== null;
      }
    };
  }

  S.documentRecovery = {
    RECOVERY_VERSION,
    DEFAULT_KEY,
    DEFAULT_DEBOUNCE_MS,
    serializeRecord,
    parseRecord,
    shouldPrompt,
    createRecovery
  };
})(window.Scribe || (window.Scribe = {}));
