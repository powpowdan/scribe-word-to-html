import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// .docx footnote conversion (docx-footnote-conversion spec): mammoth's
// footnote shape -> WET wb-fnote markup, shared with manual insertion;
// malformed refs strip with a warning; the docx entry path wires it; the
// paste path is untouched (snapshot baselines cover it).

const win = loadScribe(["document-model.js", "cleanup.js", "i18n.js", "entry.js", "footnotes.js"]);
const S = win.Scribe;
const document = win.document;

// Mammoth-shaped fixture: [k] refs in body order, trailing <ol> of entries.
function mammothDoc(entries, refsHtml) {
  const lis = entries
    .map((e, i) => {
      const id = e.id || "footnote-" + (i + 1);
      const body = e.body == null ? "<p>Note " + (i + 1) + "</p>" : e.body;
      const target = id.replace(/^footnote-/, "footnote-ref-");
      return '<li id="' + id + '">' + body + '<p><a href="#' + target + '">↑</a></p></li>';
    })
    .join("");
  const refs =
    refsHtml ||
    entries
      .map((e, i) => {
        const id = e.id || "footnote-" + (i + 1);
        const target = id.replace(/^footnote-/, "footnote-ref-");
        return 'Text<sup><a id="' + target + '" href="#' + id + '">[' + (i + 1) + ']</a></sup> ';
      })
      .join("");
  return "<p>" + refs + "end.</p><ol>" + lis + "</ol>";
}

function convert(html, lang) {
  return S.convertMammothFootnotes(html, lang || "en");
}

describe("convertMammothFootnotes", () => {
  it("converts two footnotes to sequentially numbered WET markup", () => {
    const out = convert(mammothDoc([{ body: "<p>First note</p>" }, { body: "<p>Second note</p>" }]));
    expect(out.converted).toBe(2);
    expect(out.warnings).toHaveLength(0);
    // WET reference shape, renumbered 1,2 in body order.
    expect(out.html).toContain('<sup id="fn1-rf"><a class="fn-lnk" href="#fn1">');
    expect(out.html).toContain('<sup id="fn2-rf"><a class="fn-lnk" href="#fn2">');
    // Aside + dl + dd entries with return links.
    expect(out.html).toContain('<aside class="wb-fnote"');
    expect(out.html).toContain('<dd id="fn1">');
    expect(out.html).toContain('href="#fn1-rf"');
    // mammoth's [k] refs and the notes <ol> are gone.
    expect(out.html).not.toContain("[1]");
    expect(out.html).not.toMatch(/<ol><li id="footnote-/);
    expect(out.html).toContain("First note");
  });

  it("produces markup identical in structure to manual insertion (EN and FR)", () => {
    for (const lang of ["en", "fr"]) {
      const manualRef = S.footnotes.buildFootnoteReference(1, lang).outerHTML;
      const manualEntry = document.createElement("dl");
      manualEntry.appendChild(S.footnotes.buildFootnoteEntry(1, "Shared note", lang));
      const out = convert(mammothDoc([{ body: "<p>Shared note</p>" }]), lang);
      // Reference identical.
      expect(out.html).toContain(manualRef);
      // Entry: dt + dd (with the same <p> + fn-rtn structure) identical.
      const container = document.createElement("div");
      container.innerHTML = out.html;
      const asideDl = container.querySelector("aside.wb-fnote dl");
      expect(asideDl.innerHTML).toContain(manualEntry.innerHTML.replace(/^<dl>|<\/dl>$/g, ""));
      // French strings honoured.
      if (lang === "fr") {
        expect(out.html).toContain("Notes de bas de page");
      } else {
        expect(out.html).toContain(">Footnotes<");
      }
    }
  });

  it("renumbers non-sequential Word ids in body order", () => {
    const out = convert(
      mammothDoc([{ id: "footnote-7", body: "<p>Seven</p>" }, { id: "footnote-2", body: "<p>Two</p>" }])
    );
    expect(out.html).toContain('<dd id="fn1">');
    expect(out.html).toContain("Seven");
    expect(out.html).toContain('<dd id="fn2">');
    expect(out.html).toContain("Two");
  });

  it("keeps multi-paragraph footnote bodies", () => {
    const out = convert(mammothDoc([{ body: "<p>Part one.</p><p>Part two.</p>" }]));
    expect(out.html).toContain("<p>Part one.</p>");
    expect(out.html).toContain("<p>Part two.</p>");
  });

  it("strips malformed references (no entry / empty body) with a warning", () => {
    const html =
      '<p>A<sup><a id="footnote-ref-1" href="#footnote-1">[1]</a></sup> ' +
      'B<sup><a id="footnote-ref-2" href="#footnote-2">[2]</a></sup></p>' +
      '<ol><li id="footnote-2"><p>Real</p><p><a href="#footnote-ref-2">↑</a></p></li></ol>';
    const out = convert(html);
    expect(out.converted).toBe(1);
    expect(out.warnings).toHaveLength(1);
    expect(out.warnings[0]).toMatch(/1 footnote reference had no matching content/);
    // The orphaned ref is gone; the good one converted and renumbered to 1.
    expect(out.html).not.toContain("[1]");
    expect(out.html).toContain('href="#fn1"');
    expect(out.html).toContain("Real");
  });

  it("drops unreferenced note content (never ships as an orphan list)", () => {
    const html =
      '<p>Only<sup><a id="footnote-ref-1" href="#footnote-1">[1]</a></sup></p>' +
      '<ol><li id="footnote-1"><p>Used</p><p><a href="#footnote-ref-1">↑</a></p></li>' +
      '<li id="footnote-2"><p>Never referenced</p></li></ol>';
    const out = convert(html);
    expect(out.html).toContain("Used");
    expect(out.html).not.toContain("Never referenced");
    expect(out.html).not.toContain("<ol>");
  });

  it("returns input unchanged when there are no note references", () => {
    const html = "<p>Plain <strong>bold</strong> body.</p>";
    const out = convert(html);
    expect(out.html).toBe(html);
    expect(out.converted).toBe(0);
  });

  it("handles endnote-shaped ids identically", () => {
    const html =
      '<p>E<sup><a id="endnote-ref-3" href="#endnote-3">[1]</a></sup></p>' +
      '<ol><li id="endnote-3"><p>Endnote body</p><p><a href="#endnote-ref-3">↑</a></p></li></ol>';
    const out = convert(html);
    expect(out.converted).toBe(1);
    expect(out.html).toContain('<dd id="fn1">');
    expect(out.html).toContain("Endnote body");
  });
});

describe("docx entry wiring", () => {
  async function uploadDocx(mammothHtml) {
    win.mammoth = {
      convertToHtml: () => Promise.resolve({ value: mammothHtml, messages: [] })
    };
    class StubFileReader {
      readAsArrayBuffer() {
        this.onload({ target: { result: new ArrayBuffer(0) } });
      }
    }
    win.FileReader = StubFileReader;
    const input = document.createElement("input");
    input.type = "file";
    Object.defineProperty(input, "files", { value: [{ name: "d.docx" }] });
    const model = new S.DocumentModel("");
    const seen = {};
    S.wireDocxUpload(input, model, { ChangeSource: S.ChangeSource }, {
      onDocx: (info) => { seen.docx = info; },
      onLanguageDetected: (l) => { seen.lang = l; }
    });
    input.dispatchEvent(new win.Event("change"));
    await new Promise((r) => setTimeout(r, 0));
    return { model, seen };
  }

  it("converts footnotes on the .docx path and reports warnings via onDocx", async () => {
    const { model, seen } = await uploadDocx(mammothDoc([{ body: "<p>Doc note</p>" }]));
    expect(model.getHTML()).toContain('class="fn-lnk"');
    expect(model.getHTML()).toContain('<dd id="fn1">');
    expect(seen.docx.warnings).toHaveLength(0);
    // messages still pass through (existing contract).
    expect(seen.docx.messages).toEqual([]);
  });

  it("flags malformed footnotes through the warnings banner payload", async () => {
    const html =
      '<p>X<sup><a id="footnote-ref-9" href="#footnote-9">[1]</a></sup></p>';
    const { seen } = await uploadDocx(html);
    expect(seen.docx.warnings).toHaveLength(1);
    expect(seen.docx.warnings[0]).toMatch(/footnote reference/);
  });

  it("never invokes detection when mammoth lacks _openZip (graceful null)", async () => {
    const { seen } = await uploadDocx("<p>no footnotes</p>");
    expect(seen.lang).toBeUndefined(); // detection resolved null, hook not called
  });
});
