// WYSIWYG formatting toolbar for the Live view: bold, italic, ordered/
// unordered lists, indent/outdent, block-format (p, h1-h6), and create-link.
//
// Uses document.execCommand (deprecated but universally supported) operating on
// the contentEditable selection. Button mousedown is prevented so the Live
// view's selection survives clicking the toolbar; after each command, onChange
// flushes the Live view into the document model so the Code view stays live.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

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

  // config:
  //   liveRoot  — the contentEditable element
  //   toolbar   — element containing [data-cmd] buttons (+ optional block-select)
  //   blockSelect — the <select> for formatBlock (option values = p / h1..h6)
  //   onChange  — called after each command (main.js flushes Live -> model)
  function mountWysiwyg(config) {
    const liveRoot = config.liveRoot;
    const toolbar = config.toolbar;
    const blockSelect = config.blockSelect;
    const onChange = config.onChange || function () {};

    function flush() {
      // The Live view holds the authoritative content; push it to the model so
      // the Code view reflects the formatting. (mousedown preventDefault keeps
      // focus in Live, so the normal blur-sync would not fire.)
      onChange();
    }

    function runCommand(cmd) {
      liveRoot.focus();
      if (cmd === "createLink") {
        const url = window.prompt("Link URL:", "https://");
        if (!url) return;
        exec("createLink", url);
      } else {
        exec(cmd, null);
      }
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

    if (blockSelect) {
      blockSelect.addEventListener("mousedown", (e) => e.preventDefault());
      blockSelect.addEventListener("change", () => {
        liveRoot.focus();
        // formatBlock wants a tag name; browsers accept "h2" or "<h2>".
        const val = blockSelect.value;
        if (val) exec("formatBlock", val.startsWith("<") ? val : "<" + val + ">");
        flush();
        refreshActive();
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

    // Refresh active state as the selection moves.
    document.addEventListener("selectionchange", refreshActive);
    liveRoot.addEventListener("keyup", refreshActive);
    liveRoot.addEventListener("mouseup", refreshActive);

    return {
      refreshActive,
      runCommand,
      detach() {
        document.removeEventListener("selectionchange", refreshActive);
      }
    };
  }

  S.wysiwyg = { mountWysiwyg, exec, queryState };
})(window.Scribe || (window.Scribe = {}));
