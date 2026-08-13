// Toasts: a tiny transient-notification region for activity feedback
// (e.g. "Document restored", "Copied"). createToaster(region) returns a
// show(message, type) function; toasts auto-dismiss and the region is capped.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  function createToaster(region, opts) {
    opts = opts || {};
    const max = opts.max || 3;
    const ttl = opts.ttl || 4000;
    const timer = opts.timer || {
      setTimeout: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimeout: function (id) { return clearTimeout(id); }
    };

    function show(message, type) {
      if (!region) return;
      const el = document.createElement("div");
      el.className = "toast-item toast-" + (type || "info");
      el.setAttribute("role", "status");
      el.textContent = String(message == null ? "" : message);
      region.prepend(el);
      while (region.children.length > max) {
        region.lastElementChild.remove();
      }
      const id = timer.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, ttl);
      el.dataset.timerId = String(id);
    }

    return { show: show };
  }

  S.createToaster = createToaster;
})(window.Scribe || (window.Scribe = {}));
