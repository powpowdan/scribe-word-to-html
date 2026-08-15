// HTML pretty-printer for the Code view / Copy output: newline + 2-space
// indent between BLOCK elements only. Inline flow inside a block is never
// broken (breaking it would introduce stray rendering whitespace), so the
// output renders identically to the input.
//
// Idempotent by construction: whitespace-only text nodes between blocks are
// dropped on emit, so reformatting formatted output is byte-stable.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  const BLOCK_TAGS = new Set([
    "address", "article", "aside", "blockquote", "caption", "colgroup", "dd",
    "div", "dl", "dt", "figcaption", "figure", "footer", "h1", "h2", "h3",
    "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
    "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"
  ]);

  // Block-level void elements: open tag only, no children, no close tag.
  const VOID_TAGS = new Set(["hr"]);

  function isBlockElement(node) {
    return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(node.nodeName.toLowerCase());
  }

  function ind(depth) {
    return "  ".repeat(depth);
  }

  function serializeOpenTag(el) {
    let s = "<" + el.nodeName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
      s += " " + attr.name + '="' + String(attr.value).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"';
    }
    return s + ">";
  }

  function hasDirectBlockChild(el) {
    return Array.from(el.childNodes).some(isBlockElement);
  }

  // Serialization context. `out` accumulates string pieces (the final html is
  // out.join(""); pieces are pushed fine-grained so join("") is identical to
  // the previous coarse pushes) while `tokens` records source ranges for the
  // source map (see source-map.js). Token coordinates are relative to the RAW
  // joined string; prettyHTMLDetailed shifts them onto the trimmed result.
  function createCtx() {
    return { out: [], len: 0, tokens: [] };
  }

  function push(ctx, s, tok, pad, trail) {
    if (tok) {
      ctx.tokens.push({
        type: tok.type,
        el: tok.el || null,
        node: tok.node || null,
        start: ctx.len + (pad || 0),
        end: ctx.len + s.length - (trail || 0)
      });
    }
    ctx.out.push(s);
    ctx.len += s.length;
  }

  function emitBlock(el, depth, ctx) {
    const tag = el.nodeName.toLowerCase();
    push(ctx, "\n");
    push(ctx, ind(depth));
    push(ctx, serializeOpenTag(el), { type: "open", el });
    if (VOID_TAGS.has(tag)) return;
    if (hasDirectBlockChild(el)) {
      emitChildren(el, depth + 1, ctx);
      push(ctx, "\n");
      push(ctx, ind(depth));
      push(ctx, "</" + tag + ">", { type: "close", el });
    } else {
      // Inline-only content: keep the whole block on one line, untouched.
      push(ctx, el.innerHTML);
      push(ctx, "</" + tag + ">", { type: "close", el });
    }
  }

  function emitChildren(container, depth, ctx) {
    const children = Array.from(container.childNodes);
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (child.nodeType === Node.COMMENT_NODE) {
        push(ctx, "\n");
        push(ctx, ind(depth));
        push(ctx, "<!--" + child.nodeValue + "-->", { type: "comment", node: child });
        i++;
        continue;
      }
      if (isBlockElement(child)) {
        emitBlock(child, depth, ctx);
        i++;
        continue;
      }
      // Inline run: consume consecutive non-block, non-comment siblings and
      // emit them verbatim on one line. Leading/trailing run whitespace is
      // trimmed — the run is only ever adjacent to block boundaries or the
      // container edge, where CSS collapses it anyway; INTERNAL whitespace
      // between inline siblings is preserved exactly.
      let run = "";
      while (i < children.length) {
        const c = children[i];
        if (c.nodeType === Node.COMMENT_NODE) break;
        if (isBlockElement(c)) break;
        run += c.nodeType === Node.TEXT_NODE ? c.nodeValue : c.outerHTML;
        i++;
      }
      const lead = run.length - run.replace(/^\s+/, "").length;
      const trail = run.length - run.replace(/\s+$/, "").length;
      const s = run.slice(lead, run.length - trail);
      if (s) {
        push(ctx, "\n");
        push(ctx, ind(depth));
        push(ctx, s, { type: "run" });
      }
    }
  }

  // Pretty-print the children of a root element (the root itself is not
  // serialized — pass the container whose child HTML you want).
  function prettyHTML(root) {
    return prettyHTMLDetailed(root).html;
  }

  // Same serialization, plus per-token source coordinates into the final
  // (trimmed) html. Token types: "open"/"close" (element tags), "comment",
  // "run" (a trimmed inline run). Used by source-map.js; prettyHTML output is
  // byte-identical to this html.
  function prettyHTMLDetailed(root) {
    const ctx = createCtx();
    emitChildren(root, 0, ctx);
    const raw = ctx.out.join("");
    const lead = raw.length - raw.trimStart().length;
    const html = raw.trim();
    for (const t of ctx.tokens) {
      t.start = Math.max(0, Math.min(html.length, t.start - lead));
      t.end = Math.max(0, Math.min(html.length, t.end - lead));
    }
    return { html, tokens: ctx.tokens };
  }

  S.prettyHTML = prettyHTML;
  S.prettyHTMLDetailed = prettyHTMLDetailed;
  S.isBlockElement = isBlockElement;
  S.serializeOpenTag = serializeOpenTag;
})(window.Scribe || (window.Scribe = {}));
