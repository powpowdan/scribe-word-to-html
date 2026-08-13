// Word-HTML cleanup pipeline, extracted verbatim from the legacy
// word-to-html.html IIFE. Behavior MUST match the legacy sanitizer; the
// snapshot tests in tests/cleanup.test.js lock this behavior as the
// regression baseline captured at extraction time.
//
// Legacy source: word-to-html.html (sanitizeWordHtml @ L710, stripImages @
// L866, edge-case handlers @ L836-L907, normalizeListMarkers @ L940,
// serializeCanvas figure->comment transform @ L2010).
//
// Classic script: attaches to window.Scribe so the editor opens via file://.

(function (S) {
  "use strict";

  // ===========================================================================
  // CONSTANTS  (legacy L528-L544)
  // ===========================================================================

  const DEFAULT_REMOVE_ATTRS = [
    "width", "valign", "align", "border", "cellspacing",
    "cellpadding", "nowrap", "bgcolor", "height"
  ];
  const DEFAULT_REMOVE_TAGS = ["colgroup", "br"];

  const PRESENTATION_ATTRS = new Set([
    "style", "class", "lang", "width", "height", "align", "valign",
    "border", "cellspacing", "cellpadding", "nowrap", "bgcolor",
    "color", "face", "size", "id"
  ]);

  // ===========================================================================
  // DOM HELPERS  (legacy L574-L593)
  // ===========================================================================

  function renameTag(oldEl, newTag) {
    const newNode = document.createElement(newTag);
    while (oldEl.firstChild) newNode.appendChild(oldEl.firstChild);
    for (const attr of Array.from(oldEl.attributes)) {
      newNode.setAttribute(attr.name, attr.value);
    }
    if (oldEl.parentNode) oldEl.parentNode.replaceChild(newNode, oldEl);
    return newNode;
  }

  function unwrap(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  }

  function removeElement(el) {
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  // Convert <b> -> <strong> and <i> -> <em> (Canada.ca/WET prefers strong/em).
  // Children are preserved; this is the same conversion the paste sanitizer
  // applies, extracted so live-edited content can be canonicalized too.
  function normalizeBoldItalic(container) {
    container.querySelectorAll("b").forEach((b) => {
      const s = document.createElement("strong");
      while (b.firstChild) s.appendChild(b.firstChild);
      if (b.parentNode) b.parentNode.replaceChild(s, b);
    });
    container.querySelectorAll("i").forEach((i) => {
      const e = document.createElement("em");
      while (i.firstChild) e.appendChild(i.firstChild);
      if (i.parentNode) i.parentNode.replaceChild(e, i);
    });
  }

  // ===========================================================================
  // INPUT HELPERS  (legacy L624-L639)
  // ===========================================================================

  function extractFragment(html) {
    const start = html.indexOf("<!--StartFragment-->");
    const end = html.indexOf("<!--EndFragment-->");
    if (start !== -1 && end !== -1 && end > start) {
      return html.substring(start + 20, end);
    }
    return html;
  }

  function plainTextToHtml(text) {
    return text.split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(l => `<p>${l}</p>`)
      .join("");
  }

  // ===========================================================================
  // CORE SANITIZER  (legacy sanitizeWordHtml L710-L830)
  // ===========================================================================

  function sanitizeWordHtml(html, opts) {
    opts = opts || {};
    const removeAttrs = new Set((opts.removeAttrs || DEFAULT_REMOVE_ATTRS).map(s => s.toLowerCase()));
    const removeTags = new Set((opts.removeTags || DEFAULT_REMOVE_TAGS).map(s => s.toLowerCase()));

    const container = document.createElement("div");
    container.innerHTML = html;

    // Pass 1: TreeWalker — comments, namespaced tags, removeTags, attribute stripping
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ALL, null, false);
    const toUnwrap = [];
    const toRemove = [];
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.COMMENT_NODE) {
        toRemove.push(node);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.nodeName.toLowerCase();

      // Namespaced tags (o:p, w:*, m:*, v:*, xml, etc.) → unwrap
      if (tag.indexOf(":") !== -1 || tag === "xml" || tag === "script" || tag === "style" || tag === "meta" || tag === "link") {
        toUnwrap.push(node);
        continue;
      }

      // Remove-tag list (after sanitization, e.g. colgroup, br)
      if (removeTags.has(tag)) {
        toUnwrap.push(node);
        continue;
      }

      // Attribute stripping
      const attrs = Array.from(node.attributes || []);
      for (const a of attrs) {
        const name = a.name.toLowerCase();
        const val = a.value || "";
        const isPresentation = PRESENTATION_ATTRS.has(name);
        const isMso = name.indexOf("mso") === 0 || name.indexOf(":") !== -1;
        const isMsoVal = val.indexOf("mso-") !== -1 || val.indexOf("Mso") !== -1;
        const inRemoveList = removeAttrs.has(name);
        const isDataAttr = name.indexOf("data-") === 0;
        if (isPresentation || isMso || isMsoVal || inRemoveList || isDataAttr) {
          node.removeAttribute(a.name);
        }
      }
    }

    for (const n of toRemove) removeElement(n);
    for (const n of toUnwrap) unwrap(n);

    // Pass 2: targeted transformations

    // Word-internal anchors (_Toc*, _Ref*, _Hlk*)
    container.querySelectorAll("a[name]").forEach((a) => {
      const name = a.getAttribute("name") || "";
      if (/^_Toc|^_Ref|^_Hlk/.test(name)) {
        if (!a.textContent.trim()) {
          removeElement(a);
        } else {
          // Strip the name attr; keep the anchor as a real <a> only if href present, else unwrap
          a.removeAttribute("name");
          if (!a.getAttribute("href")) unwrap(a);
        }
      }
    });

    // b → strong, i → em
    normalizeBoldItalic(container);

    // div: unwrap inside li; for top-level divs, unwrap if it contains block-level
    // children (Drupal/HTML structural wrappers), convert to <p> only if it has
    // purely inline/text content (Word text-in-div case).
    container.querySelectorAll("div").forEach((div) => {
      if (div.closest("li")) {
        unwrap(div);
        return;
      }
      const hasBlockChild = div.querySelector("p, div, table, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, section, article, header, footer");
      if (hasBlockChild) {
        unwrap(div);
      } else {
        const p = document.createElement("p");
        while (div.firstChild) p.appendChild(div.firstChild);
        div.parentNode.replaceChild(p, div);
      }
    });

    // Unwrap empty spans (no attrs left after Pass 1)
    container.querySelectorAll("span").forEach((span) => {
      if (span.attributes.length === 0) unwrap(span);
    });

    // MSO <br> cleanup + collapse consecutive <br>
    const brs = Array.from(container.querySelectorAll("br"));
    for (const br of brs) {
      const next = br.nextSibling;
      if (next && next.nodeName === "BR") {
        removeElement(br);
      }
    }

    // Empty element cleanup
    container.querySelectorAll("p, strong, span, em, u").forEach((el) => {
      if (el.textContent.trim()) return;
      if (el.nodeName === "P" && el.querySelector("br")) return; // intentional blank line
      removeElement(el);
    });

    return container.innerHTML;
  }

  // ===========================================================================
  // EDGE-CASE CONTENT HANDLING  (legacy L836-L907)
  // ===========================================================================

  function flattenNestedTables(container) {
    let count = 0;
    let inner;
    while ((inner = container.querySelector("table td table, table th table"))) {
      const outerCell = inner.closest("td, th");
      if (!outerCell) {
        // No enclosing cell — malformed. Best-effort: unwrap the inner table.
        unwrap(inner);
        continue;
      }
      const para = document.createElement("p");
      para.appendChild(document.createComment("nested table flattened"));
      outerCell.insertBefore(para, inner);
      const innerRows = inner.querySelectorAll("tr");
      innerRows.forEach((row) => {
        const cellTexts = Array.from(row.querySelectorAll("td, th"))
          .map(c => c.textContent.trim())
          .filter(t => t.length > 0);
        if (cellTexts.length > 0) {
          const rowPara = document.createElement("p");
          rowPara.textContent = cellTexts.join(" — ");
          outerCell.insertBefore(rowPara, inner);
        }
      });
      removeElement(inner);
      count++;
    }
    return count;
  }

  // Image-placeholder logic (legacy stripImages L866-L884). Replaces <img> with
  // a visible <figure class="img-placeholder"> carrying the label in
  // data-img-alt. serializeForOutput converts these back to comments.
  function stripImages(container) {
    const imgs = Array.from(container.querySelectorAll("img"));
    imgs.forEach((img) => {
      // Derive a human label: alt text → filename from src → generic.
      let label = (img.getAttribute("alt") || "").trim();
      if (!label) {
        const src = img.getAttribute("src") || "";
        const match = src.match(/([^\/\\?#]+?)(?:[?#]|$)/);
        label = match ? match[1] : "";
      }
      if (!label) label = "image";
      const fig = document.createElement("figure");
      fig.className = "img-placeholder";
      fig.setAttribute("data-img-alt", label);
      fig.textContent = "[IMAGE: " + label + "]";
      if (img.parentNode) img.parentNode.replaceChild(fig, img);
    });
    return imgs.length;
  }

  function acceptTrackChanges(container) {
    let found = 0;
    // Standard HTML5 paste from Word uses <ins> and <del>
    container.querySelectorAll("del").forEach((del) => {
      found++;
      removeElement(del);
    });
    container.querySelectorAll("ins").forEach((ins) => {
      found++;
      unwrap(ins);
    });
    // Word sometimes wraps tracked changes in spans with class "ins"/"del"
    // (classes already stripped; content remains; acceptable)
    return found > 0 ? found : 0;
  }

  function stripUnsupportedMarkup(container) {
    // Footnote containers (Word field-code wrappers, span classes already stripped)
    container.querySelectorAll(".footnote, .endnote, .footnotereference, .MsoFootnoteReference").forEach(removeElement);
    // Word comment anchors
    container.querySelectorAll(".commentreference, .msocomment").forEach(removeElement);
  }

  // ===========================================================================
  // LIST-MARKER NORMALIZATION  (legacy L940-L1019)
  // ===========================================================================

  function escapeHtmlBasic(s) {
    // Less aggressive than escapeHtml: keeps & in entities like &nbsp;
    return String(s)
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function normalizeListMarkers(container) {
    // Marker patterns
    const bulletRe = /^[·•\*]\s*/;
    const numberRe = /^\d+[.)]?\s*/;
    const subRe = /^o\s+/i; // sub-level marker

    const children = Array.from(container.children);
    let i = 0;
    while (i < children.length) {
      const child = children[i];
      if (child.nodeName !== "P") { i++; continue; }

      const text = child.textContent.replace(/\u00a0/g, " ").trim();
      const isBullet = bulletRe.test(text);
      const isNumber = numberRe.test(text);
      const isSub = subRe.test(text);

      if (!isBullet && !isNumber && !isSub) { i++; continue; }

      // Begin a list run
      const listType = isNumber ? "OL" : "UL";
      const list = document.createElement(listType.toLowerCase());
      child.parentNode.insertBefore(list, child);

      let currentLi = null;
      let j = i;
      while (j < children.length) {
        const p = children[j];
        if (p.nodeName !== "P") break;
        const t = p.textContent.replace(/\u00a0/g, " ").trim();
        if (!t) break;

        let isB = bulletRe.test(t);
        let isN = numberRe.test(t);
        let isS = subRe.test(t);
        if (!isB && !isN && !isS) break;

        // Strip the marker
        let content;
        if (isS) {
          content = t.replace(subRe, "");
        } else if (isB) {
          content = t.replace(bulletRe, "");
        } else {
          content = t.replace(numberRe, "");
        }

        if (isS && currentLi) {
          // Nested sublist under currentLi
          let subList = currentLi.querySelector(":scope > ul, :scope > ol");
          if (!subList) {
            subList = document.createElement("ul");
            currentLi.appendChild(subList);
          }
          const subLi = document.createElement("li");
          subLi.innerHTML = escapeHtmlBasic(content);
          subList.appendChild(subLi);
        } else {
          currentLi = document.createElement("li");
          currentLi.innerHTML = escapeHtmlBasic(content);
          list.appendChild(currentLi);
        }

        // consume this <p>
        const next = children[j + 1];
        p.parentNode.removeChild(p);
        children.splice(j, 1);
        // (don't advance j; we removed this index so the next one shifts in)
        if (!next) break;
      }
      i++; // move past the list we just created
    }
  }

  // ===========================================================================
  // ORCHESTRATOR  (mirrors legacy runCleanPipeline L2146-L2187, stages 1-3)
  // ===========================================================================

  // Runs the full cleanup pipeline and returns { html, warnings }.
  // Routing/canvas rendering from the legacy pipeline is intentionally absent:
  // the new editor's document model holds the cleaned HTML directly.
  function cleanWordHtml(rawHtml, opts) {
    opts = opts || {};

    // Stage 1: Sanitize
    const sanitized = sanitizeWordHtml(rawHtml, {
      removeAttrs: opts.removeAttrs || DEFAULT_REMOVE_ATTRS,
      removeTags: opts.removeTags || DEFAULT_REMOVE_TAGS
    });

    const work = document.createElement("div");
    work.innerHTML = sanitized;

    // Stage 2: Edge-case handling (pre-routing)
    const warnings = [];
    const nestedCount = flattenNestedTables(work);
    if (nestedCount > 0) warnings.push(`${nestedCount} nested table${nestedCount === 1 ? "" : "s"} flattened with comment marker.`);
    const imgCount = stripImages(work);
    if (imgCount > 0) warnings.push(`${imgCount} image${imgCount === 1 ? "" : "s"} replaced with a placeholder — handle separately.`);
    const tcCount = acceptTrackChanges(work);
    if (tcCount > 0) warnings.push(`Tracked changes detected and accepted (${tcCount} change${tcCount === 1 ? "" : "s"}).`);
    stripUnsupportedMarkup(work);

    // Stage 3: List-marker normalization (pre-routing)
    normalizeListMarkers(work);

    return { html: work.innerHTML, warnings };
  }

  // ===========================================================================
  // OUTPUT SERIALIZATION  (mirrors legacy serializeCanvas transforms L2010-L2029)
  // ===========================================================================

  // Converts the document HTML into output HTML: image placeholders become
  // <!-- image: ... --> comments and empty elements are recursively stripped
  // (table cells preserved). This is what Copy HTML produces.
  function serializeForOutput(html) {
    const clone = document.createElement("div");
    clone.innerHTML = html;

    // Convert canvas-only image placeholders into HTML comments for output
    clone.querySelectorAll(".img-placeholder").forEach((el) => {
      const label = el.getAttribute("data-img-alt") || "image";
      el.parentNode.replaceChild(document.createComment(" image: " + label + " "), el);
    });

    // Recursive empty-tag stripping — remove any element (except td/th) with no
    // text content. Loops because removing a child can empty its parent.
    let changed = true;
    while (changed) {
      changed = false;
      clone.querySelectorAll("p, span, strong, em, u, b, i, div, li").forEach((el) => {
        // Skip table cells — required for table structure even when empty
        if (el.nodeName === "TD" || el.nodeName === "TH") return;
        if (!el.textContent.trim()) {
          removeElement(el);
          changed = true;
        }
      });
    }
    return clone.innerHTML.trim();
  }

  // ===========================================================================
  // EXPORTS  (attached to the shared namespace)
  // ===========================================================================

  S.extractFragment = extractFragment;
  S.plainTextToHtml = plainTextToHtml;
  S.sanitizeWordHtml = sanitizeWordHtml;
  S.cleanWordHtml = cleanWordHtml;
  S.serializeForOutput = serializeForOutput;
  S.normalizeBoldItalic = normalizeBoldItalic;

  S._cleanupInternals = {
    DEFAULT_REMOVE_ATTRS,
    DEFAULT_REMOVE_TAGS,
    PRESENTATION_ATTRS,
    renameTag,
    unwrap,
    removeElement,
    flattenNestedTables,
    stripImages,
    acceptTrackChanges,
    stripUnsupportedMarkup,
    normalizeListMarkers
  };
})(window.Scribe || (window.Scribe = {}));
