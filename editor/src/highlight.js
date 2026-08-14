// Syntax highlighting for the Code view.
//
// Technique: a <pre> overlay BEHIND the textarea. The textarea keeps its real
// text but renders it transparent (caret still visible) — it remains the sole
// source of truth, so highlighting can never corrupt content. The overlay is
// pure decoration with pointer-events: none, scroll-synced to the textarea.
//
// tokenizeHTML / highlightHTML are pure functions (headlessly tested); the
// tokenizer is a small state machine over the raw source — display-only, so
// imperfect input can at worst mis-color, never lose data.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  // ---- Tokenizer (raw source -> [{type, text}]) ----
  // Types: text | punct | tag | attr | value | comment | doctype | entity
  function tokenizeHTML(src) {
    const tokens = [];
    const n = src.length;
    let i = 0;        // scan cursor
    let textStart = 0; // start of the pending plain-text run

    function pushText(end) {
      if (end > textStart) tokens.push({ type: "text", text: src.slice(textStart, end) });
    }

    while (i < n) {
      const lt = src.indexOf("<", i);
      if (lt === -1) break;

      // Comment: <!-- ... -->
      if (src.startsWith("<!--", lt)) {
        const end = src.indexOf("-->", lt + 4);
        const stop = end === -1 ? n : end + 3;
        pushText(lt);
        tokens.push({ type: "comment", text: src.slice(lt, stop) });
        i = textStart = stop;
        continue;
      }

      // Doctype / declarations: <! ... >
      if (src.startsWith("<!", lt)) {
        const end = src.indexOf(">", lt);
        const stop = end === -1 ? n : end + 1;
        pushText(lt);
        tokens.push({ type: "doctype", text: src.slice(lt, stop) });
        i = textStart = stop;
        continue;
      }

      // Opening/closing tag: <name ...> or </name>
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(src.slice(lt, lt + 80));
      if (!m) {
        i = lt + 1; // stray '<' — plain text; keep scanning
        continue;
      }

      pushText(lt);
      tokens.push({ type: "punct", text: m[1] ? "</" : "<" });
      tokens.push({ type: "tag", text: m[2] });

      // Attributes until '>' / '/>' / end.
      let j = lt + m[0].length;
      let closed = false;
      while (j < n && !closed) {
        const ch = src[j];
        if (ch === ">") {
          tokens.push({ type: "punct", text: ">" });
          j++;
          closed = true;
          break;
        }
        if (ch === "/" && src[j + 1] === ">") {
          tokens.push({ type: "punct", text: "/>" });
          j += 2;
          closed = true;
          break;
        }
        if (/\s/.test(ch)) {
          let k = j;
          while (k < n && /\s/.test(src[k])) k++;
          tokens.push({ type: "text", text: src.slice(j, k) }); // tag-internal whitespace
          j = k;
          continue;
        }
        // Attribute name
        let k = j;
        while (k < n && /[^\s=/>]/.test(src[k])) k++;
        if (k === j) { j++; continue; } // safety
        tokens.push({ type: "attr", text: src.slice(j, k) });
        j = k;
        // Optional "= value"
        let w = j;
        while (w < n && /\s/.test(src[w])) w++;
        if (src[w] === "=") {
          tokens.push({ type: "punct", text: "=" });
          w++;
          let w2 = w;
          while (w2 < n && /\s/.test(src[w2])) w2++;
          const q = src[w2];
          if (q === '"' || q === "'") {
            const close = src.indexOf(q, w2 + 1);
            const stop = close === -1 ? n : close + 1;
            tokens.push({ type: "value", text: src.slice(w2, stop) });
            j = stop;
          } else {
            let v = w2;
            while (v < n && /[^\s>]/.test(src[v])) v++;
            if (v > w2) tokens.push({ type: "value", text: src.slice(w2, v) });
            j = v;
          }
        }
        // no '=': whitespace run is picked up on the next loop
      }
      i = textStart = j;
    }
    pushText(n);
    return tokens;
  }

  // ---- Escaping + emit ----

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Escape a text run, then wrap character entities (&nbsp; etc.) in spans.
  function emitText(t) {
    return escapeHtml(t).replace(
      /&amp;([a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);/g,
      '<span class="tok-entity">&amp;$1;</span>'
    );
  }

  // Highlighted HTML for the overlay. Ends with a newline so a trailing-newline
  // document keeps the overlay and textarea heights matched.
  function highlightHTML(src) {
    let out = "";
    for (const t of tokenizeHTML(src)) {
      if (t.type === "text") out += emitText(t.text);
      else out += '<span class="tok-' + t.type + '">' + escapeHtml(t.text) + "</span>";
    }
    return out + "\n";
  }

  // ---- Mount (overlay wiring) ----
  // config: { textarea, pre, codeEl? }
  // Updates on 'input' (typing) and on the custom 'scribe:code-write' event
  // (programmatic writes from the document model), and scroll-syncs.
  function mountCodeHighlight(config) {
    config = config || {};
    const ta = config.textarea;
    const pre = config.pre;
    const codeEl = config.codeEl || (pre && pre.querySelector("code"));
    if (!ta || !codeEl) return null;

    function update() {
      const html = highlightHTML(ta.value);
      if (codeEl.innerHTML !== html) codeEl.innerHTML = html;
      syncScroll();
    }
    function syncScroll() {
      if (pre) {
        pre.scrollTop = ta.scrollTop;
        pre.scrollLeft = ta.scrollLeft;
      }
    }

    ta.addEventListener("input", update);
    ta.addEventListener("scribe:code-write", update);
    ta.addEventListener("scroll", syncScroll);
    update();

    return { update, syncScroll };
  }

  S.tokenizeHTML = tokenizeHTML;
  S.highlightHTML = highlightHTML;
  S.escapeHtml = escapeHtml;
  S.mountCodeHighlight = mountCodeHighlight;
})(window.Scribe || (window.Scribe = {}));
