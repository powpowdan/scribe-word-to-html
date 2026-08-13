import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// End-to-end table pipeline test: exercises the SAME path the editor uses when
// a user pastes Word content containing a table and then clicks Copy HTML.
// This is the integration confidence the unit tests (actions in isolation)
// don't cover — and the substitute for browser verification while a Word test
// document is unavailable.
//
// Path under test (mirrors entry.js paste + copy.js):
//   cleanWordHtml(rawWordFragment)
//     -> formatTablesInContainer(...)         [entry.js paste formatting]
//     -> model holds the HTML
//     -> serializeForOutput(model.getHTML())  [copy.js Copy HTML]

const win = loadScribe(["cleanup.js", "table-editor.js"]);
const S = win.Scribe;
const document = win.document;

// Reproduces the paste-then-copy path and returns the final output HTML.
function pasteAndCopy(rawWordFragment) {
  const cleaned = S.cleanWordHtml(rawWordFragment).html;
  const container = document.createElement("div");
  container.innerHTML = cleaned;
  S.tableEditor.formatTablesInContainer(container, { scope: true, trim: true });
  return S.serializeForOutput(container.innerHTML);
}

describe("E2E: Word table -> formatted -> copy output", () => {
  it("produces a WET table with thead, th scope=col, dark header, and table-responsive", () => {
    // A representative post-sanitize table: a header-ish first row + body rows.
    const raw = `
      <table>
        <tbody>
          <tr><td>Region</td><td>Funding</td><td>Jobs</td></tr>
          <tr><td>Ontario</td><td>$5 million</td><td>120</td></tr>
          <tr><td>Quebec</td><td>$3 million</td><td>80</td></tr>
        </tbody>
      </table>`;
    const out = pasteAndCopy(raw);

    // First body row was promoted to thead with th scope=col + dark styling.
    expect(out).toContain("<thead>");
    expect(out).toContain('scope="col"');
    expect(out).toContain("bg-dark");
    expect(out).toContain("text-white");
    expect(out).toContain("<tbody>");

    // WET table classes + responsive wrapper survive into the copy output.
    expect(out).toContain('class="table table-bordered');
    expect(out).toContain("table-responsive");

    // The first body cell of each row became a row header.
    expect(out).toContain('scope="row"');

    // No sanitize-time junk leaks through.
    expect(out).not.toMatch(/mso/i);
    expect(out).not.toContain("StartFragment");
  });

  it("preserves an existing <thead> (Word-supplied) and normalizes its td cells to th", () => {
    const raw = `
      <table>
        <thead><tr><td>Year</td><td>Total</td></tr></thead>
        <tbody><tr><td>2024</td><td>100</td></tr></tbody>
      </table>`;
    const out = pasteAndCopy(raw);
    // Only one thead; its cells are th scope=col (not td).
    expect(out.match(/<thead>/g).length).toBe(1);
    expect(out).toContain('scope="col"');
    const theadMatch = out.match(/<thead>[\s\S]*?<\/thead>/);
    expect(theadMatch).not.toBe(null);
    expect(theadMatch[0]).not.toContain("<td"); // thead holds only <th>
  });

  it("keeps a multi-rowspan/colspan table structurally intact through the pipeline", () => {
    const raw = `
      <table>
        <tbody>
          <tr><td>A</td><td colspan="2">B+C</td></tr>
          <tr><td>1</td><td>2</td><td>3</td></tr>
        </tbody>
      </table>`;
    const out = pasteAndCopy(raw);
    // The colspan attribute survives the pipeline into the copied output.
    expect(out).toContain('colspan="2"');
    expect(out).toContain("<thead>");
    expect(out).toContain("<tbody>");
  });
});

describe("E2E: prose + table + image placeholder together", () => {
  it("mixes prose, a formatted table, and an image-comment in one copied output", () => {
    const raw = `
      <p>Intro paragraph about FedDev.</p>
      <p>Chart below <img src="media/chart1.png" alt="Results chart"></p>
      <table>
        <tbody>
          <tr><td>Q1</td><td>Q2</td></tr>
          <tr><td>10</td><td>20</td></tr>
        </tbody>
      </table>`;
    const out = pasteAndCopy(raw);

    // Prose survives.
    expect(out).toContain("Intro paragraph about FedDev.");

    // Image became a placeholder at paste, then serialized to a comment on copy.
    expect(out).toContain("<!-- image: Results chart -->");
    expect(out).not.toContain("<img");

    // Table was formatted.
    expect(out).toContain("<thead>");
    expect(out).toContain('scope="col"');

    // No placeholder element leaks into the copied output.
    expect(out).not.toContain("img-placeholder");
  });
});
