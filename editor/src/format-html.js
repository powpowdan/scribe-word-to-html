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

  function emitBlock(el, depth, out) {
    const tag = el.nodeName.toLowerCase();
    out.push("\n" + ind(depth) + serializeOpenTag(el));
    if (VOID_TAGS.has(tag)) return;
    if (hasDirectBlockChild(el)) {
      emitChildren(el, depth + 1, out);
      out.push("\n" + ind(depth) + "</" + tag + ">");
    } else {
      // Inline-only content: keep the whole block on one line, untouched.
      out.push(el.innerHTML + "</" + tag + ">");
    }
  }

  function emitChildren(container, depth, out) {
    const children = Array.from(container.childNodes);
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (child.nodeType === Node.COMMENT_NODE) {
        out.push("\n" + ind(depth) + "<!--" + child.nodeValue + "-->");
        i++;
        continue;
      }
      if (isBlockElement(child)) {
        emitBlock(child, depth, out);
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
      const s = run.replace(/^\s+/, "").replace(/\s+$/, "");
      if (s) out.push("\n" + ind(depth) + s);
    }
  }

  // Pretty-print the children of a root element (the root itself is not
  // serialized — pass the container whose child HTML you want).
  function prettyHTML(root) {
    const out = [];
    emitChildren(root, 0, out);
    return out.join("").trim();
  }

  S.prettyHTML = prettyHTML;
})(window.Scribe || (window.Scribe = {}));
