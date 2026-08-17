// WET/Canada.ca component insertion — panels, alerts, buttons, wells from a
// toolbar dropdown. Markup builders are pure string functions (headlessly
// testable); the mounter handles caret-aware insertion into the Live view
// using the Selection/Range API (footnote pattern) and flushes to the
// document model as a labeled command so insertions are undoable and stay
// in sync with the Code view.
//
// Skeleton content is a neutral ellipsis (…) — never localized.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // Catalog drives both buildComponent and the toolbar form.
  // options.heading / options.footer mark which checkboxes apply per kind.
  const CATALOG = {
    panel: {
      label: "Panel",
      variants: ["default", "info", "success", "warning", "danger"],
      options: { heading: true, footer: true }
    },
    alert: {
      label: "Alert",
      variants: ["info", "success", "warning", "danger"],
      options: { heading: true, footer: false }
    },
    button: {
      label: "Button",
      variants: ["default", "primary", "success", "info", "warning", "danger", "link"],
      options: { heading: false, footer: false }
    },
    well: {
      label: "Well",
      variants: ["default", "small", "large"],
      options: { heading: false, footer: false }
    }
  };

  const SKELETON = "\u2026"; // neutral ellipsis — same in EN and FR

  // Blocks a component can be inserted after (block-level placement units).
  const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,figure,table,section,aside,pre,details,dl";

  // kind + opts { variant?, heading?, footer? } -> HTML string.
  // Unknown kind returns null; unknown variant falls back to the first.
  function buildComponent(kind, opts) {
    const cat = CATALOG[kind];
    if (!cat) return null;
    opts = opts || {};
    const variant = cat.variants.indexOf(opts.variant) !== -1 ? opts.variant : cat.variants[0];

    if (kind === "panel") {
      let cls = "panel panel-" + variant;
      let html = '<div class="' + cls + '">';
      if (opts.heading) {
        html += '<header class="panel-heading"><h5 class="panel-title">' + SKELETON + "</h5></header>";
      }
      html += '<div class="panel-body"><p>' + SKELETON + "</p></div>";
      if (opts.footer) {
        html += '<footer class="panel-footer">' + SKELETON + "</footer>";
      }
      html += "</div>";
      return html;
    }

    if (kind === "alert") {
      let html = '<section class="alert alert-' + variant + '">';
      if (opts.heading) html += "<h3>" + SKELETON + "</h3>";
      html += "<p>" + SKELETON + "</p>";
      html += "</section>";
      return html;
    }

    if (kind === "button") {
      // Default variant is exactly "btn" — no variant class.
      const cls = variant === "default" ? "btn" : "btn btn-" + variant;
      return '<button type="button" class="' + cls + '">' + SKELETON + "</button>";
    }

    if (kind === "well") {
      const cls = variant === "small" ? "well well-sm" : variant === "large" ? "well well-lg" : "well";
      return '<div class="' + cls + '"><p>' + SKELETON + "</p></div>";
    }

    return null;
  }

  // First element the author should type into after insertion.
  function firstEditableTarget(node) {
    if (!node || !node.querySelector) return null;
    return (
      node.querySelector(".panel-body p") ||
      node.querySelector("p") ||
      node.querySelector("h3") ||
      node.querySelector(".panel-title")
    );
  }

  // config: { liveRoot, toggle, panel, kindSelect, variantSelect,
  //           headingChk, footerChk, insertBtn, command(label), toaster }
  //   command(label) — flushes the Live view into the model as a labeled
  //   command write (main.js wires it to model.setHTML + liveView.read()).
  function mountComponents(config) {
    config = config || {};
    const liveRoot = config.liveRoot;
    const toggle = config.toggle;
    const panel = config.panel;
    const kindSelect = config.kindSelect;
    const variantSelect = config.variantSelect;
    const headingChk = config.headingChk;
    const footerChk = config.footerChk;
    const insertBtn = config.insertBtn;
    const command = config.command || function () {};
    const toaster = config.toaster;
    if (!liveRoot || !toggle || !panel || !kindSelect || !variantSelect || !insertBtn) return null;

    // Track the Live view's last selection so the dropdown's selects and
    // checkboxes (which take focus natively) don't lose the insertion point.
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
      if (liveRoot.focus) liveRoot.focus();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      return true;
    }
    document.addEventListener("selectionchange", saveSelection);

    // ---- Dropdown open/close ----
    function closePanel() {
      panel.setAttribute("hidden", "");
      toggle.setAttribute("aria-expanded", "false");
    }
    toggle.addEventListener("mousedown", (e) => e.preventDefault()); // keep the Live caret
    toggle.addEventListener("click", () => {
      const open = panel.hasAttribute("hidden");
      if (open) {
        panel.removeAttribute("hidden");
        toggle.setAttribute("aria-expanded", "true");
      } else {
        closePanel();
      }
    });
    function onDocClick(e) {
      if (panel.hasAttribute("hidden")) return;
      if (panel.contains(e.target) || toggle.contains(e.target)) return;
      closePanel();
    }
    document.addEventListener("click", onDocClick);
    function onKey(e) {
      if (e.key === "Escape" && !panel.hasAttribute("hidden")) closePanel();
    }
    document.addEventListener("keydown", onKey);

    // ---- Form: variants + contextual checkboxes follow the kind ----
    function refreshForm() {
      const cat = CATALOG[kindSelect.value] || CATALOG.panel;
      variantSelect.innerHTML = "";
      cat.variants.forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v.charAt(0).toUpperCase() + v.slice(1);
        variantSelect.appendChild(o);
      });
      if (headingChk) headingChk.closest("label").style.display = cat.options.heading ? "" : "none";
      if (footerChk) footerChk.closest("label").style.display = cat.options.footer ? "" : "none";
    }
    kindSelect.addEventListener("change", refreshForm);
    refreshForm();

    // ---- Insertion ----
    function closestBlock(node) {
      let el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
      while (el && el !== liveRoot) {
        if (el.matches && el.matches(BLOCK_SELECTOR)) return el;
        el = el.parentElement;
      }
      return null;
    }

    insertBtn.addEventListener("mousedown", (e) => e.preventDefault());
    insertBtn.addEventListener("click", () => {
      const kind = CATALOG[kindSelect.value] ? kindSelect.value : "panel";
      const cat = CATALOG[kind];
      const html = buildComponent(kind, {
        variant: variantSelect.value,
        heading: headingChk ? !!headingChk.checked : false,
        footer: footerChk ? !!footerChk.checked : false
      });
      if (!html) return;

      // Parse the built HTML into a node.
      const holder = document.createElement("div");
      holder.innerHTML = html;
      const node = holder.firstElementChild;
      if (!node) return;

      restoreSelection();
      const sel = document.getSelection && document.getSelection();
      let range = null;
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        if (liveRoot.contains(r.commonAncestorContainer)) range = r;
      }

      if (range && kind === "button") {
        // Inline: the button lands at the caret's text position.
        range.insertNode(node);
      } else if (range) {
        // Block kinds: after the caret's whole block (never split prose).
        const block = closestBlock(range.startContainer);
        if (block && block.parentNode) {
          block.parentNode.insertBefore(node, block.nextSibling);
        } else {
          liveRoot.appendChild(node);
        }
      } else {
        // No caret in the Live view: append at the document end.
        liveRoot.appendChild(node);
      }

      // Move the caret into the component's first editable spot.
      const target = firstEditableTarget(node) || node;
      try {
        const after = document.createRange();
        after.selectNodeContents(target);
        after.collapse(true);
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(after);
        }
        savedRange = after.cloneRange();
      } catch (e) { /* caret placement is browser-verified */ }
      if (liveRoot.focus) liveRoot.focus();

      command("Insert " + cat.label.toLowerCase());
      if (toaster) toaster.show(cat.label + " inserted", "success");
      closePanel();
    });

    return {
      closePanel,
      refreshForm,
      saveSelection,
      restoreSelection,
      detach() {
        document.removeEventListener("selectionchange", saveSelection);
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKey);
      }
    };
  }

  S.components = {
    CATALOG,
    SKELETON,
    BLOCK_SELECTOR,
    buildComponent,
    firstEditableTarget,
    mountComponents
  };
})(window.Scribe || (window.Scribe = {}));
