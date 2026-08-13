// Table editor: lifted from the legacy word-to-html.html IIFE and rebound to
// the new document-model architecture. Preserves every behavior in the
// table-editor spec (header promotion + dark styling, active toggle, No-<p>,
// NBSP-in-cell, move-to-footer with empty-footer-when-no-selection, and the
// table-modifier class toggles), plus the caption fields (Table #, Title,
// Unit) and the rest of the legacy toolbar (merge, delete, indent, bold,
// align).
//
// Design notes:
//   * Action functions take `table` explicitly (no global active-table state)
//     so each is a testable primitive matching a spec scenario.
//   * Selection is read from the `.selected` class on cells (same model as
//     legacy); tests set `.selected` then call the action.
//   * mountTableEditor() wires a toolbar + a Live-view root. It uses event
//     delegation so dynamically pasted tables work without per-cell wiring.
//   * After each action, mount calls config.onChange(); main.js flushes the
//     Live view into the document model so the Code view stays in sync.
//
// Classic script — attaches to window.Scribe.

(function (S) {
  "use strict";

  const { renameTag, unwrap, removeElement } = S._cleanupInternals;

  // ===========================================================================
  // SELECTION HELPERS  (legacy getCellCoords/getCellAt/getSelectedCells/...)
  // ===========================================================================

  function getCellCoords(table, cell) {
    const rows = table.querySelectorAll("tr");
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].querySelectorAll("th, td");
      for (let c = 0; c < cells.length; c++) {
        if (cells[c] === cell) return { row: r, col: c };
      }
    }
    return null;
  }

  function getCellAt(table, row, col) {
    const rows = table.querySelectorAll("tr");
    if (row < 0 || row >= rows.length) return null;
    const cells = rows[row].querySelectorAll("th, td");
    if (col < 0 || col >= cells.length) return null;
    return cells[col];
  }

  function getSelectedCells(table) {
    return Array.from(table.querySelectorAll("td.selected, th.selected"));
  }

  function getSelectedRows(table) {
    const rows = new Set();
    table.querySelectorAll("td.selected, th.selected").forEach((c) => {
      const tr = c.closest("tr");
      if (tr) rows.add(tr);
    });
    return Array.from(rows);
  }

  function deselectAllCells(table) {
    table.querySelectorAll(".selected, .hovered").forEach((c) => {
      c.classList.remove("selected", "hovered");
    });
  }

  // ===========================================================================
  // CAPTION  (legacy insertCaption/buildCaptionFromTable/extractCaptionFromTable)
  // ===========================================================================

  function insertCaption(table, num, title, unit) {
    let caption = table.querySelector("caption");
    if (caption) caption.innerHTML = "";
    else {
      caption = document.createElement("caption");
      caption.classList.add("text-left", "fnt-nrml");
      table.insertBefore(caption, table.firstChild);
    }
    if (num) caption.appendChild(document.createTextNode(num));
    if (title) {
      if (num) caption.appendChild(document.createElement("br"));
      const strong = document.createElement("strong");
      strong.appendChild(document.createTextNode(title));
      caption.appendChild(strong);
    }
    if (unit) {
      caption.appendChild(document.createElement("br"));
      const small = document.createElement("small");
      small.appendChild(document.createTextNode(unit));
      caption.appendChild(small);
    }
  }

  function buildCaptionFromTable(table) {
    const num = table.getAttribute("data-caption-num") || "";
    const title = table.getAttribute("data-caption-title") || "";
    const unit = table.getAttribute("data-caption-unit") || "";
    insertCaption(table, num, title, unit);
  }

  function extractCaptionFromTable(table) {
    const caption = table.querySelector("caption");
    if (!caption) return { num: "", title: "", unit: "" };

    const strong = caption.querySelector("strong");
    const title = strong ? strong.textContent.trim() : "";

    const small = caption.querySelector("small");
    const unit = small ? small.textContent.trim() : "";

    // Number = leading text/content before the first <br>, <strong>, or <small>
    let num = "";
    for (const node of caption.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        num += node.textContent;
      } else if (node.nodeName === "BR" || node.nodeName === "STRONG" || node.nodeName === "SMALL") {
        break;
      } else {
        num += node.textContent;
      }
    }
    num = num.trim();

    if (!title && !unit) {
      const fullText = caption.textContent.trim();
      if (fullText) return { num: "", title: fullText, unit: "" };
    }
    return { num, title, unit };
  }

  // ===========================================================================
  // TABLE FORMATTER  (legacy formatTableOnClean + presets + french numbers)
  // ===========================================================================

  function trimNBSP(s) {
    s = s.trim();
    while (s.startsWith("&nbsp;")) s = s.substring(6);
    while (s.endsWith("&nbsp;")) s = s.substring(0, s.length - 6);
    return s;
  }

  function applyFrenchNumbers(table) {
    table.querySelectorAll("td").forEach((td) => {
      if (!td.innerText) return;
      const spaces = /(\d) (\d\d\d)/g;
      const decimal = /(\d)\.(\d)/g;
      let html = td.innerHTML;
      while (html.match(/\d \d\d\d/)) html = html.replace(spaces, "$1&nbsp;$2");
      html = html.replace(decimal, "$1,$2");
      td.innerHTML = html;
    });
  }

  // The "format" pass that satisfies table-editor spec requirements 1 & 2
  // (header cells + dark styling) and 4 (first-cell row headers). Mirrors
  // legacy formatTableOnClean L1243-L1353. Returns the table's wrapper.
  function formatTableOnClean(table, opts) {
    opts = opts || {};
    const scopeOn = opts.scope !== false;
    const trimOn = opts.trim !== false;
    const preset = opts.preset || "none";

    // Extract existing caption into data attributes for the toolbar.
    const cap = extractCaptionFromTable(table);
    if (cap.num) table.setAttribute("data-caption-num", cap.num);
    if (cap.title) table.setAttribute("data-caption-title", cap.title);
    if (cap.unit) table.setAttribute("data-caption-unit", cap.unit);

    // Ensure tbody exists.
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      while (table.firstChild) {
        if (table.firstChild.nodeName.toLowerCase() === "tr") {
          tbody.appendChild(table.firstChild);
        } else {
          table.removeChild(table.firstChild);
        }
      }
      table.appendChild(tbody);
    }

    // Ensure thead exists; if missing, promote the first body row into one.
    let thead = table.querySelector("thead");
    if (!thead) {
      thead = document.createElement("thead");
      table.insertBefore(thead, tbody);
      const firstRow = tbody.querySelector("tr");
      if (firstRow) thead.appendChild(firstRow);
    }

    // Normalize every thead row: cells become <th scope=col>, row gets dark
    // styling. Also covers Word-supplied theads whose cells were <td>.
    thead.querySelectorAll("tr").forEach((tr) => {
      tr.classList.add("bg-dark", "text-white");
      tr.querySelectorAll("td, th").forEach((cell) => {
        let th = cell;
        if (cell.nodeName.toLowerCase() === "td") th = renameTag(cell, "th");
        if (scopeOn) th.setAttribute("scope", "col");
      });
    });

    // Add WET table classes.
    table.classList.add("table", "table-bordered");

    // For each body row: rename first cell to th with scope=row (or
    // colgroup/rowgroup if it spans).
    tbody.querySelectorAll("tr").forEach((tr) => {
      const firstChild = tr.querySelector("td, th");
      if (!firstChild) return;
      let firstTh = firstChild;
      if (firstChild.nodeName.toLowerCase() === "td") {
        firstTh = renameTag(firstChild, "th");
      }
      if (scopeOn) {
        if (firstTh.hasAttribute("colspan")) {
          firstTh.setAttribute("scope", "colgroup");
        } else if (firstTh.hasAttribute("rowspan")) {
          firstTh.setAttribute("scope", "rowgroup");
        } else {
          firstTh.setAttribute("scope", "row");
        }
      }
      if (preset === "financial") {
        tr.querySelectorAll("td").forEach((td) => td.classList.add("text-right"));
      }
    });

    if (preset === "financial") {
      const theadRows = table.querySelectorAll("thead tr");
      theadRows.forEach((tr) => {
        let count = 0;
        tr.querySelectorAll("th, td").forEach((cell) => {
          if (count > 0) cell.classList.add("text-right");
          count++;
        });
      });
    }

    if (trimOn) {
      table.querySelectorAll("th, td").forEach((cell) => {
        let html = cell.innerHTML.replace(/\s{2,}/g, " ");
        html = trimNBSP(html);
        cell.innerHTML = html;
      });
    }

    if (preset === "french") {
      applyFrenchNumbers(table);
    }

    // Wrap in table-responsive if not already (WET convention; kept in output).
    const parent = table.parentElement;
    let wrapper = parent && parent.classList.contains("table-responsive") ? parent : null;
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.classList.add("table-responsive");
      if (table.parentNode) table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
    return wrapper;
  }

  // Runs the format pass on every table in a container. Used at paste time so
  // pasted tables arrive formatted (preserves the legacy renderCanvas UX).
  function formatTablesInContainer(container, opts) {
    container.querySelectorAll("table").forEach((t) => formatTableOnClean(t, opts));
  }

  // Immediately applies a preset to an existing table (idempotent additions).
  // Mirrors legacy applyPresetToTable L1377-L1400.
  function applyPresetToTable(table, preset) {
    if (!table) return;
    if (preset === "financial") {
      table.querySelectorAll("thead tr").forEach((tr) => {
        let count = 0;
        tr.querySelectorAll("th, td").forEach((cell) => {
          if (count > 0) cell.classList.add("text-right");
          count++;
        });
      });
      table.querySelectorAll("tbody td").forEach((td) => td.classList.add("text-right"));
    } else if (preset === "backgrounder") {
      table.querySelectorAll("tr.active").forEach((tr) => {
        tr.classList.remove("active");
        tr.classList.add("bg-info");
      });
    } else if (preset === "french") {
      applyFrenchNumbers(table);
    }
  }

  // ===========================================================================
  // ACTIONS  (legacy action_* L1553-L1862; refactored to take `table` + opts)
  // ===========================================================================

  function isRowActive(row) {
    return row.classList.contains("active") || row.classList.contains("bg-info");
  }

  function toggleHeader(table, opts) {
    opts = opts || {};
    const scopeOn = opts.scope !== false;
    const preset = opts.preset || "none";
    const tbody = table.querySelector("tbody");
    const thead = table.querySelector("thead");
    if (!tbody || !thead) return;

    // Move selected tbody rows to thead.
    const rowsToHead = [];
    tbody.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector(".selected")) rowsToHead.push(tr);
    });
    rowsToHead.forEach((tr) => {
      tr.classList.add("bg-dark", "text-white");
      let count = 0;
      tr.querySelectorAll("td, th").forEach((cell) => {
        let th = cell;
        if (cell.nodeName.toLowerCase() === "td") th = renameTag(cell, "th");
        if (scopeOn) th.setAttribute("scope", "col");
        if (preset === "financial" && count > 0) th.classList.add("text-right");
        count++;
      });
      thead.appendChild(tr);
    });

    // Move selected thead rows back to tbody.
    const rowsToBody = [];
    thead.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector(".selected")) rowsToBody.push(tr);
    });
    rowsToBody.forEach((tr) => {
      tr.classList.remove("active", "bg-info");
      tr.classList.remove("bg-dark", "text-white");
      let isFirst = true;
      tr.querySelectorAll("th, td").forEach((cell) => {
        if (isFirst) {
          if (scopeOn) cell.setAttribute("scope", "row");
          isFirst = false;
          return;
        }
        if (cell.nodeName.toLowerCase() === "th") {
          const td = renameTag(cell, "td");
          if (preset === "financial") td.classList.add("text-right");
        }
      });
      tbody.appendChild(tr);
    });

    deselectAllCells(table);
  }

  // Ensure the footer has a single spanning <td> scaffolding and return it.
  function ensureFooterCell(table, tfoot) {
    let footerTd = tfoot.querySelector("tr > td");
    if (!footerTd) {
      const tr = document.createElement("tr");
      tr.classList.add("small");
      const td = document.createElement("td");
      let maxWidth = 0;
      table.querySelectorAll("tr").forEach((r) => {
        const w = r.querySelectorAll("th, td").length;
        if (w > maxWidth) maxWidth = w;
      });
      td.setAttribute("colspan", String(maxWidth));
      tr.appendChild(td);
      tfoot.appendChild(tr);
      footerTd = td;
    }
    return footerTd;
  }

  function moveToFooter(table) {
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }

    // No selection → ensure an empty footer exists, then stop.
    const hasSelection = !!table.querySelector("td.selected, th.selected");
    if (!hasSelection) {
      ensureFooterCell(table, tfoot);
      deselectAllCells(table);
      return;
    }

    // Selection → move selected cells' content into the footer cell.
    const footerTd = ensureFooterCell(table, tfoot);
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    const rowsToRemove = [];
    tbody.querySelectorAll("tr").forEach((tr) => {
      const selectedCell = tr.querySelector(".selected");
      if (selectedCell) {
        const p = document.createElement("p");
        p.innerHTML = selectedCell.innerHTML;
        footerTd.appendChild(p);
        rowsToRemove.push(tr);
      }
    });
    rowsToRemove.forEach(removeElement);
    deselectAllCells(table);
  }

  function toggleActive(table, activeClass) {
    const cls = activeClass || "active";
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach((tr) => {
      if (!tr.querySelector(".selected")) return;
      const isNowActive = !isRowActive(tr);
      if (isNowActive) {
        tr.classList.add(cls);
      } else {
        tr.classList.remove("active", "bg-info");
      }
      // Bolding/scope is a backgrounder (bg-info) behavior only. The plain
      // "active" class is background-only; scope is never changed.
      if (cls === "bg-info") {
        tr.querySelectorAll("th, td").forEach((cell) => {
          if (cell.nodeName.toLowerCase() === "th") {
            cell.classList.toggle("fnt-nrml", !isNowActive);
          } else {
            setBold(cell, isNowActive);
          }
        });
      }
    });
  }

  function mergeRow(table) {
    const tbody = table.querySelector("tbody");
    if (!tbody) return;
    tbody.querySelectorAll("tr").forEach((tr) => {
      if (tr.querySelector(".selected")) {
        tr.querySelectorAll("th, td").forEach((c) => c.classList.add("selected"));
      }
    });
    mergeCells(table);
  }

  function mergeCells(table) {
    const rows = table.querySelectorAll("tr");
    rows.forEach((row) => {
      const selected = Array.from(row.querySelectorAll(".selected"));
      if (selected.length <= 1) return;
      const first = selected[0];
      let count = first.hasAttribute("colspan") ? parseInt(first.getAttribute("colspan"), 10) : 1;
      for (let i = 1; i < selected.length; i++) {
        count += selected[i].hasAttribute("colspan") ? parseInt(selected[i].getAttribute("colspan"), 10) : 1;
        removeElement(selected[i]);
      }
      first.setAttribute("colspan", String(count));
      first.classList.remove("selected");
    });
  }

  function deleteRow(table) {
    getSelectedRows(table).forEach(removeElement);
    deselectAllCells(table);
  }

  function indent(table, delta) {
    const levels = ["mrgn-lft-md", "mrgn-lft-lg", "mrgn-lft-xl"];
    const cells = getSelectedCells(table);
    cells.forEach((c) => {
      let wrapper = c.querySelector("div." + levels.join(", div."));
      if (delta > 0) {
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.classList.add("text-left", "fnt-nrml", levels[0]);
          while (c.firstChild) wrapper.appendChild(c.firstChild);
          c.appendChild(wrapper);
        } else if (wrapper.classList.contains(levels[0])) {
          wrapper.classList.remove(levels[0]);
          wrapper.classList.add(levels[1]);
        } else if (wrapper.classList.contains(levels[1])) {
          wrapper.classList.remove(levels[1]);
          wrapper.classList.add(levels[2]);
        }
      } else {
        const md = c.querySelector("div." + levels[0]);
        const lg = c.querySelector("div." + levels[1]);
        const xl = c.querySelector("div." + levels[2]);
        if (md) {
          while (md.firstChild) c.insertBefore(md.firstChild, md);
          removeElement(md);
        } else if (lg) {
          lg.classList.remove(levels[1]);
          lg.classList.add(levels[0]);
        } else if (xl) {
          xl.classList.remove(levels[2]);
          xl.classList.add(levels[1]);
        }
      }
    });
  }

  function setBold(cell, value) {
    if (cell.nodeName === "TH") {
      if (value) cell.classList.remove("fnt-nrml");
      else cell.classList.add("fnt-nrml");
    } else {
      if (value) {
        if (!cell.firstChild || cell.firstChild.nodeName !== "STRONG") {
          const strong = document.createElement("strong");
          while (cell.firstChild) strong.appendChild(cell.firstChild);
          cell.appendChild(strong);
        }
      } else {
        const strong = cell.querySelector("strong");
        if (strong) unwrap(strong);
        const b = cell.querySelector("b");
        if (b) unwrap(b);
      }
    }
  }

  function toggleBold(table) {
    const cells = getSelectedCells(table);
    const allBold = cells.every((c) =>
      c.nodeName === "TH" ? !c.classList.contains("fnt-nrml") : c.firstChild && c.firstChild.nodeName === "STRONG"
    );
    cells.forEach((c) => setBold(c, !allBold));
  }

  function removeParagraphs(table) {
    getSelectedCells(table).forEach((cell) => {
      // Snapshot first — unwrap mutates the live tree.
      const paras = Array.from(cell.querySelectorAll("p"));
      paras.forEach((p) => {
        // Join consecutive sibling paragraphs with <br>.
        if (p.nextElementSibling && p.nextElementSibling.nodeName === "P") {
          p.appendChild(document.createElement("br"));
        }
        unwrap(p);
      });
    });
  }

  function nbsp(table) {
    getSelectedCells(table).forEach((cell) => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, null, false);
      const targets = [];
      let node;
      while ((node = walker.nextNode())) targets.push(node);
      targets.forEach((t) => {
        if (t.nodeValue && t.nodeValue.indexOf(" ") !== -1) {
          t.nodeValue = t.nodeValue.replace(/ /g, "\u00A0");
        }
      });
    });
  }

  function align(table, dir) {
    getSelectedCells(table).forEach((c) => {
      c.classList.remove("text-left", "text-right", "text-center");
      if (dir === "left") c.classList.add("text-left");
      else if (dir === "center") c.classList.add("text-center");
      else if (dir === "right") c.classList.add("text-right");
    });
  }

  function toggleModifier(table, cls, on) {
    if (!table) return;
    table.classList.toggle(cls, on);
  }

  // ===========================================================================
  // INCREMENT 5 ADDITIONS (tractable subset; complex scoping deferred)
  // ===========================================================================

  // ----- Undo/redo history (per active table) -----
  // Stores innerHTML snapshots; commit() records a new state, undo()/redo()
  // move the pointer and return the state to restore (or null at the bound).
  function createTableHistory() {
    let stack = [];
    let idx = -1;
    return {
      reset(html) {
        stack = [html];
        idx = 0;
      },
      commit(html) {
        if (idx >= 0 && stack[idx] === html) return;
        stack = stack.slice(0, idx + 1);
        stack.push(html);
        idx = stack.length - 1;
      },
      undo() {
        if (idx > 0) {
          idx--;
          return stack[idx];
        }
        return null;
      },
      redo() {
        if (idx < stack.length - 1) {
          idx++;
          return stack[idx];
        }
        return null;
      },
      get canUndo() {
        return idx > 0;
      },
      get canRedo() {
        return idx < stack.length - 1;
      }
    };
  }

  // ----- Delete column (colspan-aware) -----
  // Builds a visual grid accounting for colspan/rowspan, then removes the
  // columns touched by selected cells. A cell whose span is wholly within the
  // deleted columns is removed; a cell that partially overlaps has its colspan
  // reduced by the overlap count (so unrelated columns are preserved).
  function buildCellGrid(table) {
    const trs = Array.from(table.querySelectorAll("tr"));
    const grid = [];
    for (let r = 0; r < trs.length; r++) {
      if (!grid[r]) grid[r] = [];
      let c = 0;
      for (const cell of Array.from(trs[r].children)) {
        if (!cell.matches || !cell.matches("td, th")) continue;
        while (grid[r][c] !== undefined) c++;
        const colSpan = parseInt(cell.getAttribute("colspan"), 10) || 1;
        const rowSpan = parseInt(cell.getAttribute("rowspan"), 10) || 1;
        for (let dr = 0; dr < rowSpan; dr++) {
          for (let dc = 0; dc < colSpan; dc++) {
            if (!grid[r + dr]) grid[r + dr] = [];
            grid[r + dr][c + dc] = cell;
          }
        }
        c += colSpan;
      }
    }
    return grid;
  }

  function deleteColumns(table) {
    const grid = buildCellGrid(table);
    if (!grid.length) return;
    // Columns to delete = union of visual columns covered by selected cells.
    const delCols = new Set();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (cell && cell.classList.contains("selected")) delCols.add(c);
      }
    }
    if (!delCols.size) return;

    // Process each cell once (a rowspan cell occupies several grid slots).
    const seen = new Set();
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cell = grid[r][c];
        if (!cell || seen.has(cell)) continue;
        seen.add(cell);
        const colSpan = parseInt(cell.getAttribute("colspan"), 10) || 1;
        let overlap = 0;
        for (let dc = 0; dc < colSpan; dc++) {
          if (delCols.has(c + dc)) overlap++;
        }
        if (overlap === 0) continue;
        if (overlap === colSpan) {
          removeElement(cell);
        } else {
          const newSpan = colSpan - overlap;
          if (newSpan <= 1) cell.removeAttribute("colspan");
          else cell.setAttribute("colspan", String(newSpan));
        }
      }
    }
    deselectAllCells(table);
  }

  // ----- Add empty footer row (always; distinct from move-to-footer) -----
  function addEmptyFooterRow(table) {
    let tfoot = table.querySelector("tfoot");
    if (!tfoot) {
      tfoot = document.createElement("tfoot");
      table.appendChild(tfoot);
    }
    const tr = document.createElement("tr");
    tr.classList.add("small");
    const td = document.createElement("td");
    let maxWidth = 0;
    table.querySelectorAll("tr").forEach((r) => {
      // Direct cell children only (avoid counting cells inside any nested
      // table). Uses .children rather than the :scope selector so it works
      // across DOM implementations including happy-dom.
      const w = Array.from(r.children)
        .filter((cell) => cell.matches && cell.matches("td, th"))
        .reduce((sum, cell) => sum + (parseInt(cell.getAttribute("colspan"), 10) || 1), 0);
      if (w > maxWidth) maxWidth = w;
    });
    td.setAttribute("colspan", String(maxWidth || 1));
    tr.appendChild(td);
    tfoot.appendChild(tr);
  }

  // ----- ID/caption suggestions (from document context) -----
  function getTablePosition(liveRoot, table) {
    const tables = liveRoot.querySelectorAll("table");
    for (let i = 0; i < tables.length; i++) {
      if (tables[i] === table) return i + 1;
    }
    return 1;
  }

  function suggestTableId(liveRoot, table) {
    return "tbl-" + getTablePosition(liveRoot, table);
  }

  // Nearest preceding heading text (document order), or "" if none.
  function suggestCaptionFromContext(liveRoot, table) {
    const headings = liveRoot.querySelectorAll("h1, h2, h3, h4, h5, h6");
    let last = null;
    for (const h of Array.from(headings)) {
      if (h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) {
        last = h;
      } else {
        break;
      }
    }
    return last ? last.textContent.trim() : "";
  }

  // ===========================================================================
  // MOUNT  (wires a toolbar + Live-view root; rebinding of bindToolbar/
  // attachTableWidget/onCellMouse*/activateTableWidget for the new arch)
  // ===========================================================================

  // config:
  //   liveRoot       — contentEditable element containing tables
  //   toolbar        — the #tableToolbar element (hidden until a table activates)
  //   onChange       — called after each action; main.js flushes Live -> model
  //   getOpts        — () => ({ scope: bool, preset: string }) from the toolbar
  //   getActiveClass — () => "active" | "bg-info" (legacy: derived from preset)
  //   ids            — { captionNumber, captionTitle, captionUnit,
  //                      condensedOpt, stripedOpt, hoverOpt } element ids
  function mountTableEditor(config) {
    const liveRoot = config.liveRoot;
    const toolbar = config.toolbar;
    const onChange = config.onChange || function () {};
    const getOpts = config.getOpts || function () { return { scope: true, preset: "none" }; };
    const getActiveClass = config.getActiveClass || function () { return "active"; };
    const ids = config.ids || {};

    let activeTable = null;
    let selectionStart = null;
    let selectionEnd = null;
    let isMouseDown = false;
    let history = null;

    function activeTableEl() {
      return activeTable;
    }

    // Undo/redo helpers (history is reset whenever a table activates).
    function commitHistory() {
      if (history && activeTable) {
        history.commit(activeTable.innerHTML);
        updateUndoRedoButtons();
      }
    }
    function updateUndoRedoButtons() {
      const u = document.getElementById(ids.undoBtn || "undoBtn");
      const r = document.getElementById(ids.redoBtn || "redoBtn");
      if (u) u.disabled = history ? !history.canUndo : true;
      if (r) r.disabled = history ? !history.canRedo : true;
    }
    function updateSuggestions() {
      if (!activeTable) return;
      const idBtn = document.getElementById(ids.suggestIdBtn || "suggestIdBtn");
      const capBtn = document.getElementById(ids.suggestCaptionBtn || "suggestCaptionBtn");
      if (idBtn) {
        const s = suggestTableId(liveRoot, activeTable);
        idBtn.title = "Use suggested ID: " + s;
        if (idBtn.querySelector("span")) idBtn.querySelector("span").textContent = s;
      }
      if (capBtn) {
        const s = suggestCaptionFromContext(liveRoot, activeTable);
        capBtn.title = s ? "Use suggested caption: " + s : "No nearby heading found";
        capBtn.disabled = !s;
      }
    }

    function deactivateAll() {
      if (activeTable) deselectAllCells(activeTable);
      activeTable = null;
      if (toolbar) toolbar.hidden = true;
    }

    function activate(table) {
      if (activeTable === table) return;
      if (activeTable) deselectAllCells(activeTable);
      activeTable = table;
      if (toolbar) {
        toolbar.hidden = false;
        syncToolbarFromTable();
        history = createTableHistory();
        history.reset(table.innerHTML);
        updateUndoRedoButtons();
        updateSuggestions();
      }
    }

    function syncToolbarFromTable() {
      const t = activeTable;
      if (!t) return;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
      const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
      setVal(ids.captionNumber, t.getAttribute("data-caption-num") || "");
      setVal(ids.captionTitle, t.getAttribute("data-caption-title") || "");
      setVal(ids.captionUnit, t.getAttribute("data-caption-unit") || "");
      setVal(ids.tableId || "tableId", t.id || "");
      setChk(ids.condensedOpt, t.classList.contains("table-condensed"));
      setChk(ids.stripedOpt, t.classList.contains("table-striped"));
      setChk(ids.hoverOpt, t.classList.contains("table-hover"));
    }

    function updateHover(table) {
      table.querySelectorAll(".hovered").forEach((c) => c.classList.remove("hovered"));
      if (!selectionStart || !selectionEnd) return;
      const rMin = Math.min(selectionStart.row, selectionEnd.row);
      const rMax = Math.max(selectionStart.row, selectionEnd.row);
      const cMin = Math.min(selectionStart.col, selectionEnd.col);
      const cMax = Math.max(selectionStart.col, selectionEnd.col);
      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          const cell = getCellAt(table, r, c);
          if (cell && !cell.classList.contains("selected")) cell.classList.add("hovered");
        }
      }
    }

    function applySelection(table) {
      table.querySelectorAll(".hovered").forEach((c) => {
        c.classList.remove("hovered");
        c.classList.add("selected");
      });
    }

    // ---- Event delegation on the Live view (handles dynamic tables) ----
    function onMousedown(e) {
      const cell = e.target.closest("td, th");
      if (!cell) return;
      const table = cell.closest("table");
      if (!table || !liveRoot.contains(table)) return;
      activate(table);
      if (!e.shiftKey) deselectAllCells(table);
      selectionStart = getCellCoords(table, cell);
      selectionEnd = selectionStart;
      isMouseDown = true;
      cell.classList.add("selected");
      e.preventDefault();
    }
    function onMouseover(e) {
      if (!isMouseDown || !activeTable) return;
      const cell = e.target.closest("td, th");
      if (!cell) return;
      const table = cell.closest("table");
      if (table !== activeTable) return;
      selectionEnd = getCellCoords(table, cell);
      updateHover(table);
    }
    function onMouseup() {
      if (!isMouseDown) return;
      isMouseDown = false;
      if (activeTable) applySelection(activeTable);
    }

    liveRoot.addEventListener("mousedown", onMousedown);
    liveRoot.addEventListener("mouseover", onMouseover);
    document.addEventListener("mouseup", onMouseup);

    // ---- Click outside any table deactivates ----
    function onOutsideMousedown(e) {
      if (!activeTable) return;
      if (liveRoot.contains(e.target)) return; // inside the editor surface
      if (toolbar && toolbar.contains(e.target)) return;
      deactivateAll();
    }
    document.addEventListener("mousedown", onOutsideMousedown, true);

    // ---- Toolbar button wiring ----
    function bind(id, fn) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("click", () => {
        if (!activeTable) return;
        fn(activeTable);
        commitHistory();
        onChange();
      });
    }

    bind("theadBtn", (t) => toggleHeader(t, getOpts()));
    bind("tfootBtn", moveToFooter);
    bind("activeBtn", (t) => toggleActive(t, getActiveClass()));
    bind("mergeRowBtn", mergeRow);
    bind("mergeBtn", mergeCells);
    bind("deleteRowBtn", deleteRow);
    bind("deleteColBtn", deleteColumns);
    bind("addFooterBtn", addEmptyFooterRow);
    bind("indentBtn", (t) => indent(t, 1));
    bind("outdentBtn", (t) => indent(t, -1));
    bind("boldBtn", toggleBold);
    bind("removePBtn", removeParagraphs);
    bind("nbspBtn", nbsp);
    bind("leftAlignBtn", (t) => align(t, "left"));
    bind("centerAlignBtn", (t) => align(t, "center"));
    bind("rightAlignBtn", (t) => align(t, "right"));

    // Undo / redo.
    const undoEl = document.getElementById(ids.undoBtn || "undoBtn");
    const redoEl = document.getElementById(ids.redoBtn || "redoBtn");
    if (undoEl) {
      undoEl.addEventListener("click", () => {
        if (!history || !activeTable) return;
        const prev = history.undo();
        if (prev !== null) {
          activeTable.innerHTML = prev;
          updateUndoRedoButtons();
          onChange();
        }
      });
    }
    if (redoEl) {
      redoEl.addEventListener("click", () => {
        if (!history || !activeTable) return;
        const next = history.redo();
        if (next !== null) {
          activeTable.innerHTML = next;
          updateUndoRedoButtons();
          onChange();
        }
      });
    }

    const deselectEl = document.getElementById("deselectBtn");
    if (deselectEl) deselectEl.addEventListener("click", () => { if (activeTable) deselectAllCells(activeTable); });

    // Table-modifier class toggles.
    [
      [ids.condensedOpt, "table-condensed"],
      [ids.stripedOpt, "table-striped"],
      [ids.hoverOpt, "table-hover"]
    ].forEach(([id, cls]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => {
        if (!activeTable) return;
        toggleModifier(activeTable, cls, el.checked);
        onChange();
      });
    });

    // Caption live update.
    [ids.captionNumber, ids.captionTitle, ids.captionUnit].forEach((id, i) => {
      const el = document.getElementById(id);
      if (!el) return;
      const attr = ["data-caption-num", "data-caption-title", "data-caption-unit"][i];
      el.addEventListener("input", () => {
        if (!activeTable) return;
        activeTable.setAttribute(attr, el.value);
        buildCaptionFromTable(activeTable);
        onChange();
      });
    });

    // Table id field + ID/caption suggestion one-tap accept.
    const tableIdEl = document.getElementById(ids.tableId || "tableId");
    if (tableIdEl) {
      tableIdEl.addEventListener("input", () => {
        if (!activeTable) return;
        const v = tableIdEl.value.trim();
        if (v) activeTable.setAttribute("id", v);
        else activeTable.removeAttribute("id");
        onChange();
      });
    }
    const suggestIdEl = document.getElementById(ids.suggestIdBtn || "suggestIdBtn");
    if (suggestIdEl) {
      suggestIdEl.addEventListener("click", () => {
        if (!activeTable || !tableIdEl) return;
        tableIdEl.value = suggestTableId(liveRoot, activeTable);
        tableIdEl.dispatchEvent(new Event("input"));
      });
    }
    const suggestCapEl = document.getElementById(ids.suggestCaptionBtn || "suggestCaptionBtn");
    if (suggestCapEl) {
      suggestCapEl.addEventListener("click", () => {
        if (!activeTable) return;
        const s = suggestCaptionFromContext(liveRoot, activeTable);
        if (!s) return;
        const titleEl = document.getElementById(ids.captionTitle);
        if (titleEl) {
          titleEl.value = s;
          titleEl.dispatchEvent(new Event("input"));
        }
      });
    }

    return {
      getActiveTable: activeTableEl,
      deactivateAll,
      detach() {
        liveRoot.removeEventListener("mousedown", onMousedown);
        liveRoot.removeEventListener("mouseover", onMouseover);
        document.removeEventListener("mouseup", onMouseup);
        document.removeEventListener("mousedown", onOutsideMousedown, true);
      }
    };
  }

  // ===========================================================================
  // EXPORTS
  // ===========================================================================

  S.tableEditor = {
    // formatting + presets
    formatTableOnClean,
    formatTablesInContainer,
    applyPresetToTable,
    applyFrenchNumbers,
    // caption
    insertCaption,
    buildCaptionFromTable,
    extractCaptionFromTable,
    // selection helpers
    getCellCoords,
    getCellAt,
    getSelectedCells,
    getSelectedRows,
    deselectAllCells,
    // actions (testable primitives)
    toggleHeader,
    moveToFooter,
    ensureFooterCell,
    toggleActive,
    isRowActive,
    mergeRow,
    mergeCells,
    deleteRow,
    indent,
    setBold,
    toggleBold,
    removeParagraphs,
    nbsp,
    align,
    toggleModifier,
    // increment 5 additions
    createTableHistory,
    buildCellGrid,
    deleteColumns,
    addEmptyFooterRow,
    getTablePosition,
    suggestTableId,
    suggestCaptionFromContext,
    // lifecycle
    mountTableEditor
  };
})(window.Scribe || (window.Scribe = {}));
