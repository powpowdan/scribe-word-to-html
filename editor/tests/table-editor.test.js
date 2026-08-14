import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Regression coverage for every requirement in openspec/specs/table-editor/
// spec.md, exercised against the lifted table-editor primitives. These pin the
// lifted behavior to the same contract the legacy editor delivered.

const win = loadScribe(["cleanup.js", "table-editor.js"]);
const S = win.Scribe;
const document = win.document;
const T = S.tableEditor;

function makeTable(html) {
  const div = document.createElement("div");
  div.innerHTML = html.trim();
  return div.querySelector("table");
}

// ----- Requirement 1: Header rows use column-header cells -----
describe("Requirement: Header rows use column-header cells", () => {
  it("Word-supplied thead with td cells is normalized to th scope=col", () => {
    const table = makeTable(
      "<table><thead><tr><td>A</td><td>B</td></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    T.formatTableOnClean(table, { scope: true });
    const theadCells = table.querySelectorAll("thead th");
    expect(theadCells.length).toBe(2);
    theadCells.forEach((c) => expect(c.getAttribute("scope")).toBe("col"));
    expect(table.querySelector("thead td")).toBe(null);
  });

  it("first body row is promoted to thead when none exists, cells become th scope=col", () => {
    const table = makeTable(
      "<table><tbody><tr><td>H1</td><td>H2</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    T.formatTableOnClean(table, { scope: true });
    expect(table.querySelectorAll("thead tr").length).toBe(1);
    const theadCells = table.querySelectorAll("thead th");
    expect(theadCells.length).toBe(2);
    theadCells.forEach((c) => expect(c.getAttribute("scope")).toBe("col"));
  });
});

// ----- Requirement 2: Header rows carry dark styling -----
describe("Requirement: Header rows carry dark styling", () => {
  it("thead tr gets bg-dark text-white on format", () => {
    const table = makeTable(
      "<table><thead><tr><th>X</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>"
    );
    T.formatTableOnClean(table);
    const tr = table.querySelector("thead tr");
    expect(tr.classList.contains("bg-dark")).toBe(true);
    expect(tr.classList.contains("text-white")).toBe(true);
  });
});

// ----- Requirement 3: Active toggle applies background only -----
describe("Requirement: Active toggle applies background only", () => {
  it("adds the active class without changing scope or bolding the cell", () => {
    const table = makeTable(
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr><th scope=\"row\">k</th><td>v</td></tr></tbody></table>"
    );
    // Select a cell in the body row, then toggle active with the plain class.
    const bodyRow = table.querySelector("tbody tr");
    bodyRow.querySelector("td").classList.add("selected");
    T.toggleActive(table, "active");

    expect(bodyRow.classList.contains("active")).toBe(true);
    // Leading cell scope is preserved.
    expect(bodyRow.querySelector("th").getAttribute("scope")).toBe("row");
    // No bold/normal-weight class or <strong> was added to cells.
    expect(bodyRow.querySelector("strong")).toBe(null);
    bodyRow.querySelectorAll("th, td").forEach((c) => {
      expect(c.classList.contains("fnt-nrml")).toBe(false);
    });
  });

  it("removing active clears the class and leaves weight/scope unchanged", () => {
    const table = makeTable(
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr class=\"active\"><th scope=\"row\">k</th><td>v</td></tr></tbody></table>"
    );
    const bodyRow = table.querySelector("tbody tr");
    bodyRow.querySelector("td").classList.add("selected");
    T.toggleActive(table, "active"); // already active → toggles off
    expect(bodyRow.classList.contains("active")).toBe(false);
    expect(bodyRow.querySelector("th").getAttribute("scope")).toBe("row");
  });
});

// ----- Requirement 4: Remove paragraphs from selected cells -----
describe("Requirement: Remove paragraphs from selected cells", () => {
  it("unwraps a single paragraph", () => {
    const table = makeTable("<table><tbody><tr><td><p>Hello</p></td></tr></tbody></table>");
    const cell = table.querySelector("td");
    cell.classList.add("selected");
    T.removeParagraphs(table);
    expect(cell.innerHTML).toBe("Hello");
  });

  it("joins consecutive paragraphs with <br>", () => {
    const table = makeTable("<table><tbody><tr><td><p>A</p><p>B</p></td></tr></tbody></table>");
    const cell = table.querySelector("td");
    cell.classList.add("selected");
    T.removeParagraphs(table);
    expect(cell.innerHTML).toBe("A<br>B");
  });

  it("unwraps a paragraph nested inside a list item", () => {
    const table = makeTable("<table><tbody><tr><td><ul><li><p>item</p></li></ul></td></tr></tbody></table>");
    const cell = table.querySelector("td");
    cell.classList.add("selected");
    T.removeParagraphs(table);
    expect(cell.innerHTML).toBe("<ul><li>item</li></ul>");
  });
});

// ----- Requirement 5: Non-breaking-space selected cells -----
describe("Requirement: Non-breaking-space selected cells", () => {
  it("replaces regular spaces with U+00A0 in cell text", () => {
    const table = makeTable("<table><tbody><tr><td>FedDev Ontario</td></tr></tbody></table>");
    table.querySelector("td").classList.add("selected");
    T.nbsp(table);
    expect(table.querySelector("td").textContent).toBe("FedDev\u00A0Ontario");
    expect(table.querySelector("td").textContent.includes(" ")).toBe(false);
  });

  it("leaves spaces inside attribute values untouched", () => {
    const table = makeTable('<table><tbody><tr><td><a title="x y">link</a></td></tr></tbody></table>');
    table.querySelector("td").classList.add("selected");
    T.nbsp(table);
    expect(table.querySelector("a").getAttribute("title")).toBe("x y");
  });
});

// ----- Requirement 6: Empty footer creation -----
describe("Requirement: Empty footer creation", () => {
  it("creates an empty spanning footer with no selection", () => {
    const table = makeTable(
      "<table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>"
    );
    T.moveToFooter(table); // no selection
    const tfoot = table.querySelector("tfoot");
    expect(tfoot).not.toBe(null);
    const td = tfoot.querySelector("td");
    expect(td).not.toBe(null);
    expect(td.getAttribute("colspan")).toBe("3");
    expect(td.textContent.trim()).toBe("");
    // No body content was moved.
    expect(table.querySelectorAll("tbody tr").length).toBe(1);
  });

  it("does not duplicate a footer when one already exists and there is no selection", () => {
    const table = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody><tfoot><tr><td colspan=\"2\">existing</td></tr></tfoot></table>"
    );
    T.moveToFooter(table); // no selection
    expect(table.querySelectorAll("tfoot").length).toBe(1);
    expect(table.querySelector("tfoot td").textContent).toBe("existing");
  });

  it("moves selected content into the footer when cells are selected", () => {
    const table = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    table.querySelector("tbody td").classList.add("selected");
    T.moveToFooter(table);
    expect(table.querySelectorAll("tbody tr").length).toBe(0);
    expect(table.querySelector("tfoot").textContent).toContain("1");
  });
});

// ----- Requirement 7: Table-modifier class toggles -----
describe("Requirement: Table-modifier class toggles", () => {
  it("toggling a class on adds it to the table", () => {
    const table = makeTable("<table><tbody><tr><td>x</td></tr></tbody></table>");
    T.toggleModifier(table, "table-striped", true);
    expect(table.classList.contains("table-striped")).toBe(true);
  });

  it("toggling a class off removes it from the table", () => {
    const table = makeTable('<table class="table-hover"><tbody><tr><td>x</td></tr></tbody></table>');
    T.toggleModifier(table, "table-hover", false);
    expect(table.classList.contains("table-hover")).toBe(false);
  });

  it("the three modifiers are independent", () => {
    const table = makeTable("<table><tbody><tr><td>x</td></tr></tbody></table>");
    T.toggleModifier(table, "table-condensed", true);
    T.toggleModifier(table, "table-striped", true);
    expect(table.classList.contains("table-condensed")).toBe(true);
    expect(table.classList.contains("table-striped")).toBe(true);
    expect(table.classList.contains("table-hover")).toBe(false);
  });
});

// ===== Increment 5 additions =====

// ----- Undo/redo history -----
describe("Requirement: Undo and redo history for table edits", () => {
  it("records states and moves the pointer on undo/redo", () => {
    const h = T.createTableHistory();
    h.reset("a");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);

    h.commit("b");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    expect(h.undo()).toBe("a");
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    expect(h.redo()).toBe("b");
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);
  });

  it("undo at the bound returns null (no earlier state)", () => {
    const h = T.createTableHistory();
    h.reset("a");
    expect(h.undo()).toBe(null);
  });

  it("a new commit after undo drops the redo tail", () => {
    const h = T.createTableHistory();
    h.reset("a");
    h.commit("b");
    h.undo(); // back to "a"
    h.commit("c"); // branch — "b" is discarded
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBe(null);
    expect(h.undo()).toBe("a");
  });
});

// ----- Delete column (colspan-aware) -----
describe("Requirement: Delete selected columns", () => {
  it("removes a single column across all rows", () => {
    const table = makeTable(
      "<table><tbody><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>"
    );
    // Select the middle column's cell in row 0 only -> column 1 deleted everywhere.
    table.querySelector("tbody tr td:nth-child(2)").classList.add("selected");
    T.deleteColumns(table);

    const rows = table.querySelectorAll("tbody tr");
    expect(rows[0].querySelectorAll("td, th").length).toBe(2);
    expect(rows[1].querySelectorAll("td, th").length).toBe(2);
    // Column 1 ("B" / "2") is gone; A, C / 1, 3 remain.
    expect(table.textContent).not.toContain("B");
    expect(table.textContent).not.toContain("2");
    expect(table.textContent).toContain("A");
    expect(table.textContent).toContain("C");
  });

  it("reduces a spanning cell's colspan instead of removing unrelated columns", () => {
    const table = makeTable(
      "<table><tbody>" +
        "<tr><td colspan=\"3\">spanned</td></tr>" +
        "<tr><td>A</td><td>B</td><td>C</td></tr>" +
        "</tbody></table>"
    );
    // Select B (col 1) in the second row.
    const secondRowCells = table.querySelectorAll("tbody tr:nth-child(2) td");
    secondRowCells[1].classList.add("selected");
    T.deleteColumns(table);

    const spanning = table.querySelector("tbody tr:first-child td");
    expect(spanning.getAttribute("colspan")).toBe("2"); // 3 - 1 overlap
    const remainingSecondRow = table.querySelectorAll("tbody tr:nth-child(2) td");
    expect(remainingSecondRow.length).toBe(2); // A and C survive; B removed
    expect(remainingSecondRow[0].textContent).toBe("A");
    expect(remainingSecondRow[1].textContent).toBe("C");
  });
});

// ----- Add empty footer row -----
describe("Requirement: Dedicated add-empty-footer-row action", () => {
  it("creates an empty spanning footer row when no footer exists", () => {
    const table = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    T.addEmptyFooterRow(table);
    const tfoot = table.querySelector("tfoot");
    expect(tfoot).not.toBe(null);
    const td = tfoot.querySelector("tr > td");
    expect(td.getAttribute("colspan")).toBe("2");
    expect(td.textContent.trim()).toBe("");
  });

  it("always adds a new row, even with a selection present and even when a footer exists", () => {
    const table = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody><tfoot><tr><td colspan=\"2\">existing</td></tr></tfoot></table>"
    );
    table.querySelector("tbody td").classList.add("selected");
    T.addEmptyFooterRow(table);
    // A NEW empty row was added alongside the existing one; selected content not moved.
    expect(table.querySelectorAll("tfoot tr").length).toBe(2);
    expect(table.querySelectorAll("tbody tr").length).toBe(1); // body intact
    expect(table.querySelector("tbody td").textContent).toBe("1"); // selection not moved
  });
});

// ----- ID/caption suggestions -----
describe("Requirement: Suggested table IDs and captions", () => {
  function context() {
    const root = document.createElement("div");
    root.innerHTML =
      '<h2>Funding Results</h2>' +
      '<div class="table-responsive"><table id="t1"><tbody><tr><td>a</td></tr></tbody></table></div>' +
      '<h3>Detail breakdown</h3>' +
      '<div class="table-responsive"><table id="t2"><tbody><tr><td>b</td></tr></tbody></table></div>';
    return root;
  }

  it("suggests a position-based table id", () => {
    const root = context();
    expect(T.suggestTableId(root, root.querySelector("#t1"))).toBe("tbl-1");
    expect(T.suggestTableId(root, root.querySelector("#t2"))).toBe("tbl-2");
  });

  it("suggests a caption from the nearest preceding heading", () => {
    const root = context();
    expect(T.suggestCaptionFromContext(root, root.querySelector("#t1"))).toBe("Funding Results");
    expect(T.suggestCaptionFromContext(root, root.querySelector("#t2"))).toBe("Detail breakdown");
  });

  it("returns an empty caption when no preceding heading exists", () => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="table-responsive"><table><tbody><tr><td>x</td></tr></tbody></table></div>';
    expect(T.suggestCaptionFromContext(root, root.querySelector("table"))).toBe("");
  });
});

// ===== Complex-table accessibility (H43 id/headers) =====
describe("Complex-table accessibility (H43)", () => {
  it("isComplexTable detects multi-level / merged-header tables", () => {
    const simple = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><th>R</th><td>1</td></tr></tbody></table>"
    );
    expect(T.isComplexTable(simple)).toBe(false);

    const twoHeadRows = makeTable(
      "<table><thead><tr><th>A</th></tr><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>"
    );
    expect(T.isComplexTable(twoHeadRows)).toBe(true);

    const colspan = makeTable(
      "<table><thead><tr><th colspan=\"2\">A</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    expect(T.isComplexTable(colspan)).toBe(true);
  });

  it("generates ids + headers for a 2-level column-header table", () => {
    // X spans 2 rows (col0); Y spans 2 cols (row0 col1-2); C1/C2 under Y.
    const table = makeTable(
      "<table>" +
        "<thead>" +
        "<tr><th rowspan=\"2\">X</th><th colspan=\"2\">Y</th></tr>" +
        "<tr><th>C1</th><th>C2</th></tr>" +
        "</thead>" +
        "<tbody><tr><th>R</th><td>1</td><td>2</td></tr></tbody>" +
        "</table>"
    );
    T.generateAccessibilityHeaders(table, "tbl1");

    // Every th got a position-based id.
    const ths = table.querySelectorAll("th");
    ths.forEach((th) => expect(th.id.length).toBeGreaterThan(0));

    const td1 = table.querySelector("tbody td:nth-child(2)");
    const td2 = table.querySelector("tbody td:nth-child(3)");
    // td1 (col1): Y(parent, r0c1) + C1(r1c1) + R(r2c0)
    expect(td1.getAttribute("headers")).toBe("tbl1-r0-c1 tbl1-r1-c1 tbl1-r2-c0");
    // td2 (col2): Y(r0c1, first pos) + C2(r1c2) + R(r2c0)
    expect(td2.getAttribute("headers")).toBe("tbl1-r0-c1 tbl1-r1-c2 tbl1-r2-c0");
  });

  it("preserves a human-set th id and builds around it", () => {
    const table = makeTable(
      "<table><thead><tr><th id=\"keep-me\" colspan=\"2\">Y</th></tr></thead>" +
        "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    T.generateAccessibilityHeaders(table, "tbl1");
    expect(table.querySelector("thead th").id).toBe("keep-me");
    // td references the preserved id.
    expect(table.querySelector("td").getAttribute("headers")).toContain("keep-me");
  });

  it("self-consistency: every referenced id exists and th ids are unique", () => {
    const table = makeTable(
      "<table><thead>" +
        "<tr><th rowspan=\"2\">X</th><th colspan=\"2\">Y</th></tr>" +
        "<tr><th>C1</th><th>C2</th></tr>" +
        "</thead><tbody><tr><th>R</th><td>1</td><td>2</td></tr></tbody></table>"
    );
    T.generateAccessibilityHeaders(table, "tbl1");

    const thIds = new Set();
    table.querySelectorAll("th").forEach((th) => {
      expect(th.id).toBeTruthy();
      expect(thIds.has(th.id)).toBe(false);
      thIds.add(th.id);
    });
    table.querySelectorAll("td[headers]").forEach((td) => {
      td.getAttribute("headers")
        .split(/\s+/)
        .forEach((id) => {
          expect(thIds.has(id)).toBe(true); // no dangling references
        });
    });
  });

  it("a simple table left to the caller: scope-only (no id/headers added here)", () => {
    // generateAccessibilityHeaders CAN run on simple tables, but the auto path
    // only runs it on complex tables. Verify the auto gate doesn't fire here.
    const simple = makeTable(
      "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><th>R</th><td>1</td><td>2</td></tr></tbody></table>"
    );
    expect(T.isComplexTable(simple)).toBe(false);
    // And formatTablesInContainer does NOT add headers attrs to a simple table.
    const container = document.createElement("div");
    container.appendChild(simple);
    T.formatTablesInContainer(container, { scope: true, trim: true });
    expect(simple.querySelector("td[headers]")).toBe(null);
  });
});

// ----- Toolbar deactivation on click-away (mount lifecycle) -----
describe("Table toolbar hides when clicking outside the active table", () => {
  function setup(html) {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    const toolbar = document.createElement("div");
    toolbar.hidden = true;
    document.body.appendChild(toolbar);
    const api = T.mountTableEditor({ liveRoot: root, toolbar, onChange() {} });
    return { root, toolbar, api };
  }
  function mousedown(el) {
    el.dispatchEvent(new win.Event("mousedown", { bubbles: true }));
  }

  it("clicking prose elsewhere in the Live view deactivates the table and hides the toolbar", () => {
    const { root, toolbar, api } = setup(
      "<p>prose</p><table><tbody><tr><td>cell</td></tr></tbody></table>"
    );

    mousedown(root.querySelector("td")); // activate
    expect(toolbar.hidden).toBe(false);
    expect(api.getActiveTable()).not.toBe(null);

    mousedown(root.querySelector("p")); // click away, still inside the Live view
    expect(toolbar.hidden).toBe(true);
    expect(api.getActiveTable()).toBe(null);

    api.detach();
    root.remove();
    toolbar.remove();
  });

  it("clicking another table switches activation (deactivate old, activate new)", () => {
    const { root, toolbar, api } = setup(
      "<table id=\"t1\"><tbody><tr><td>a</td></tr></tbody></table>" +
        "<table id=\"t2\"><tbody><tr><td>b</td></tr></tbody></table>"
    );

    mousedown(root.querySelector("#t1 td"));
    expect(api.getActiveTable().id).toBe("t1");

    mousedown(root.querySelector("#t2 td")); // capture deactivates t1, delegation activates t2
    expect(toolbar.hidden).toBe(false);
    expect(api.getActiveTable().id).toBe("t2");

    api.detach();
    root.remove();
    toolbar.remove();
  });

  it("clicking inside the active table keeps the toolbar open", () => {
    const { root, toolbar, api } = setup(
      "<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>"
    );

    const cells = root.querySelectorAll("td");
    mousedown(cells[0]);
    mousedown(cells[1]); // still the same table
    expect(toolbar.hidden).toBe(false);
    expect(api.getActiveTable()).not.toBe(null);

    api.detach();
    root.remove();
    toolbar.remove();
  });
});

// ----- Caption-field suggestion placeholders on activation -----
describe("Caption fields get suggestion placeholders on table activation", () => {
  function setup(html) {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.appendChild(root);
    const toolbar = document.createElement("div");
    toolbar.hidden = true;
    document.body.appendChild(toolbar);
    // Real inputs with ids (the mount looks them up by id).
    const num = document.createElement("input"); num.id = "captionNumber";
    const title = document.createElement("input"); title.id = "captionTitle";
    const unit = document.createElement("input"); unit.id = "captionUnit";
    document.body.appendChild(num);
    document.body.appendChild(title);
    document.body.appendChild(unit);
    const api = T.mountTableEditor({
      liveRoot: root,
      toolbar,
      onChange() {},
      ids: { captionNumber: "captionNumber", captionTitle: "captionTitle", captionUnit: "captionUnit" }
    });
    return { root, toolbar, api, num, title, unit, cleanup() { api.detach(); root.remove(); toolbar.remove(); num.remove(); title.remove(); unit.remove(); } };
  }

  it("placeholders show the table position and the nearest preceding heading", () => {
    const ctx = setup(
      "<h2>Funding Results</h2><p>text</p><table><tbody><tr><td>a</td></tr></tbody></table>"
    );
    ctx.root.querySelector("td").dispatchEvent(new win.Event("mousedown", { bubbles: true }));

    expect(ctx.num.placeholder).toBe("Table: 1");    // position among tables
    expect(ctx.title.placeholder).toBe("Funding Results"); // nearest preceding heading
    expect(ctx.unit.placeholder).toBe("$ amount or subtext");
    // Values stay empty — a placeholder is a hint, not a commit.
    expect(ctx.num.value).toBe("");
    expect(ctx.title.value).toBe("");
    ctx.cleanup();
  });

  it("an existing caption fills the VALUES, not the placeholders", () => {
    const ctx = setup(
      '<table data-caption-num="3" data-caption-title="Existing" data-caption-unit="$M"><tbody><tr><td>a</td></tr></tbody></table>'
    );
    ctx.root.querySelector("td").dispatchEvent(new win.Event("mousedown", { bubbles: true }));
    expect(ctx.num.value).toBe("3");
    expect(ctx.title.value).toBe("Existing");
    expect(ctx.unit.value).toBe("$M");
    ctx.cleanup();
  });
});
