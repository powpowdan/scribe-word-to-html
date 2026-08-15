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

  // Wrap every <table> whose parent is not already a .table-responsive div
  // (WET convention; every table in output must carry the wrapper).
  // Idempotent: already-wrapped tables are left untouched, wrapper and all.
  function ensureTableResponsive(container) {
    container.querySelectorAll("table").forEach((table) => {
      const parent = table.parentElement;
      if (parent && parent.classList && parent.classList.contains("table-responsive")) return;
      const wrapper = document.createElement("div");
      wrapper.classList.add("table-responsive");
      if (table.parentNode) table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  // ===========================================================================
  // WORD COMMENT REMOVAL
  // ===========================================================================

  // Classes Word uses in clipboard HTML for comments: the inline reference
  // anchor (msocomrefanchor span wrapping an msocomanchor link) and the
  // comment text blocks appended after the body (msocomtxt). The legacy
  // ".commentreference/.msocomment" selectors are kept for safety.
  const WORD_COMMENT_CLASSES = new Set([
    "msocomrefanchor", "msocomanchor", "msocomtxt",
    "msocommentreference", "commentreference", "msocomment"
  ]);

  // True when the element is part of Word's comment markup. Classes are
  // checked case-insensitively (Word emits class=MsoCommentReference).
  function isWordCommentMarker(el) {
    const cls = (el.getAttribute("class") || "").toLowerCase();
    if (cls && cls.split(/\s+/).some((c) => WORD_COMMENT_CLASSES.has(c))) return true;
    // Word also wraps the anchor glyph in a span identified only by style.
    if (el.nodeName.toLowerCase() === "span") {
      const style = (el.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
      if (style.indexOf("mso-special-character:comment") !== -1) return true;
    }
    return false;
  }

  // Remove Word comments from a container, wherever they came from:
  //  - Word paste markup (class/style identified anchors + msocomtxt blocks)
  //  - mammoth .docx output ([Author1] inline anchors with id="comment-ref-N"
  //    plus a trailing <dl> whose <dt> terms carry id="comment-N")
  // Must run before sanitizeWordHtml's attribute stripping (classes/styles are
  // the signal). Returns how many comment constructs were removed.
  function stripWordComments(container) {
    let count = 0;
    const markers = Array.from(container.querySelectorAll("*")).filter(isWordCommentMarker);
    markers.forEach((el) => {
      // An anchor link nested inside a reference-anchor span leaves with its
      // parent; count and remove only the outermost marker.
      if (markers.some((m) => m !== el && m.contains(el))) return;
      removeElement(el);
      count++;
    });
    container.querySelectorAll('a[id^="comment-ref-"]').forEach((a) => {
      removeElement(a);
      count++;
    });
    container.querySelectorAll("dl").forEach((dl) => {
      const dts = Array.from(dl.children).filter((c) => c.nodeName === "DT");
      // Only a dl made entirely of mammoth comment terms is comment markup;
      // a dl with any non-comment dt is real content and is kept.
      if (dts.length > 0 && dts.every((dt) => (dt.id || "").indexOf("comment-") === 0)) {
        removeElement(dl);
        count++;
      }
    });
    return count;
  }

  // String convenience over stripWordComments (for the mammoth .docx path,
  // which produces an HTML string rather than a DOM container).
  function stripWordCommentsFromHtml(html) {
    const container = document.createElement("div");
    container.innerHTML = html;
    stripWordComments(container);
    return container.innerHTML;
  }

  // Remove Word-internal bookmark anchors. Word marks its own bookmarks with
  // a leading underscore in the name attribute (_Toc*, _Ref*, _Hlk*, and the
  // newer _the_heading_title style). An empty anchor is removed outright; one
  // wrapping content is unwrapped so the content survives. Author-made
  // bookmarks (no leading underscore) are kept.
  function stripWordBookmarks(container) {
    container.querySelectorAll("a[name]").forEach((a) => {
      const name = a.getAttribute("name") || "";
      if (!name.startsWith("_")) return;
      if (!a.textContent.trim() && !a.querySelector("img, table, ul, ol")) {
        removeElement(a);
      } else {
        unwrap(a);
      }
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

    // Word comments first — identification relies on classes/styles that
    // Pass 1 strips below (this also heals the legacy dead selector ordering).
    stripWordComments(container);

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

    // Word-internal bookmark anchors (_Toc*, _Ref*, _Hlk*, _heading_title…)
    stripWordBookmarks(container);

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
    // Word comment anchors are removed by stripWordComments (sanitizeWordHtml),
    // which runs before attribute stripping so the classes are still present.
  }

  // ===========================================================================
  // DOCX FOOTNOTE CONVERSION  (mammoth output -> WET wb-fnote markup)
  // ===========================================================================

  // Mammoth renders .docx footnotes/endnotes into the body as:
  //   refs:    <sup><a id="footnote-ref-N" href="#footnote-N">[k]</a></sup>
  //   entries: trailing <ol><li id="footnote-N">body…<p><a href="#footnote-ref-N">↑</a></p></li></ol>
  // This converts that shape into the WET pattern produced by the manual
  // Insert Footnote command (footnotes.js builders — one shared construction
  // path, bilingual strings). The paste path never calls this: Word clipboard
  // footnote markup carries no recoverable content and stays stripped.
  //
  // Returns { html, warnings, converted } — html is the input unchanged when
  // no note references are present.
  function convertMammothFootnotes(html, lang) {
    const notesLang = lang || (S.i18n ? S.i18n.getLanguage() : "en") || "en";
    const warnings = [];
    const container = document.createElement("div");
    container.innerHTML = html;

    const refs = container.querySelectorAll(
      'sup > a[href^="#footnote-"], sup > a[href^="#endnote-"]'
    );
    if (!refs.length) return { html, warnings, converted: 0 };

    // Map note id (from the entry li) -> li element.
    const entries = {};
    container.querySelectorAll("ol > li[id]").forEach((li) => {
      const m = /^(footnote|endnote)-\d+$/.test(li.id || "");
      if (m) entries[li.id] = li;
    });

    let converted = 0;
    let malformed = 0;
    let dl = null;
    refs.forEach((a) => {
      const sup = a.parentNode;
      const noteId = (a.getAttribute("href") || "").slice(1);
      const li = entries[noteId];
      // Body = the li's children minus mammoth's trailing back-link <p>
      // (the <p> whose only link targets the reference anchor).
      let bodyNodes = [];
      if (li) {
        bodyNodes = Array.from(li.childNodes).filter((node) => {
          if (node.nodeType === 1 && node.tagName === "P") {
            const back = node.querySelector('a[href^="#footnote-ref-"], a[href^="#endnote-ref-"]');
            const onlyLink = back && node.textContent.replace(/\s|↑/g, "") === "";
            if (onlyLink) return false;
          }
          return true;
        });
      }
      if (!li || !bodyNodes.length) {
        // Unconvertible: strip the reference so no dead anchor ships.
        malformed++;
        if (sup.parentNode) sup.remove();
        return;
      }
      converted++;
      if (!dl) dl = S.footnotes.ensureFootnotesAside(container, notesLang);
      dl.appendChild(S.footnotes.buildFootnoteEntryNodes(converted, bodyNodes, notesLang));
      sup.parentNode.replaceChild(S.footnotes.buildFootnoteReference(converted, notesLang), sup);
    });

    // Remove every mammoth note-entry li — converted ones (already rebuilt
    // inside the aside) and unreferenced ones (note content without a
    // reference never ships) — and drop the notes <ol> once empty.
    container.querySelectorAll("ol > li[id]").forEach((li) => {
      if (/^(footnote|endnote)-\d+$/.test(li.id || "")) li.remove();
    });
    container.querySelectorAll("ol").forEach((ol) => {
      if (!ol.children.length && !ol.closest("aside")) ol.remove();
    });

    if (malformed > 0) {
      warnings.push(
        malformed + " footnote reference" + (malformed === 1 ? " had no matching content and was removed" : "s had no matching content and were removed") + "."
      );
    }
    return { html: container.innerHTML, warnings, converted };
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

    // Guarantee the WET table-responsive wrapper on every table in output.
    ensureTableResponsive(clone);

    // Drop any Word bookmark anchors that survived earlier editing.
    stripWordBookmarks(clone);

    // Defense in depth: drop Word comments (paste markup or mammoth artifacts)
    // that reached the document via raw Code-view HTML or an uncleaned path.
    stripWordComments(clone);

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
  S.ensureTableResponsive = ensureTableResponsive;
  S.stripWordBookmarks = stripWordBookmarks;
  S.stripWordComments = stripWordComments;
  S.stripWordCommentsFromHtml = stripWordCommentsFromHtml;

  S.convertMammothFootnotes = convertMammothFootnotes;

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
    convertMammothFootnotes,
    normalizeListMarkers,
    stripWordComments,
    isWordCommentMarker,
    WORD_COMMENT_CLASSES
  };
})(window.Scribe || (window.Scribe = {}));
