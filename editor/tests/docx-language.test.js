import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// DOCX language detection (docx-language-detection spec): run-level <w:lang>
// tallying with thresholds, graceful degradation, manual-override session
// semantics in the host wiring, and no detection on the paste path.

const win = loadScribe(["document-model.js", "cleanup.js", "i18n.js", "entry.js"]);
const S = win.Scribe;
const document = win.document;

function runsXml(runs) {
  return (
    '<?xml version="1.0"?><w:document xmlns:w="x">' +
    runs
      .map(
        ([lang, text]) =>
          "<w:r>" +
          (lang ? '<w:rPr><w:lang w:val="' + lang + '"/></w:rPr>' : "") +
          "<w:t>" + text + "</w:t>" +
          "</w:r>"
      )
      .join("") +
    "</w:document>"
  );
}

const FR = "français adjacents aux résultats "; // ~32 chars
const EN = "english text adjacent to results ";   // ~32 chars

function many(str, n) {
  return new Array((n == null ? 1 : n) + 1).join(str);
}

describe("tallyLanguagesFromXml", () => {
  it("tallies per-run language char counts", () => {
    const t = S.tallyLanguagesFromXml(runsXml([["fr-CA", many(FR, 2)], ["en-US", many(EN, 1)]]));
    expect(t.fr).toBe(many(FR, 2).length);
    expect(t.en).toBe(many(EN).length);
  });

  it("ignores untagged runs entirely and counts unknown languages separately", () => {
    const t = S.tallyLanguagesFromXml(runsXml([["fr-CA", many(FR, 1)], [null, "untagged text"], ["de-DE", "deutsche text"]]));
    expect(t.fr).toBe(many(FR).length);
    expect(t.en).toBe(0);
    expect(t.other).toBe("deutsche text".length);
  });

  it("survives malformed XML (zero counts)", () => {
    const t = S.tallyLanguagesFromXml("<w:document><w:r>broken");
    expect(t.fr + t.en + t.other).toBe(0);
  });
});

describe("detectDocxLanguage", () => {
  it("resolves fr when French dominates above threshold with enough sample", async () => {
    win.mammoth = {
      _openZip: () =>
        Promise.resolve({
          exists: (p) => p === "word/document.xml",
          read: () => Promise.resolve(runsXml([["fr-CA", many(FR, 10)]]))
        })
    };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe("fr");
  });

  it("resolves en when English dominates", async () => {
    win.mammoth = {
      _openZip: () =>
        Promise.resolve({
          exists: () => true,
          read: () => Promise.resolve(runsXml([["en-US", many(EN, 10)]]))
        })
    };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe("en");
  });

  it("resolves null when the sample is below the floor", async () => {
    win.mammoth = {
      _openZip: () =>
        Promise.resolve({
          exists: () => true,
          read: () => Promise.resolve(runsXml([["fr-CA", "trop petit"]]))
        })
    };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe(null);
  });

  it("resolves null for mixed bilingual documents (below predominance)", async () => {
    win.mammoth = {
      _openZip: () =>
        Promise.resolve({
          exists: () => true,
          read: () => Promise.resolve(runsXml([["fr-CA", many(FR, 5)], ["en-US", many(EN, 5)]]))
        })
    };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe(null);
  });

  it("resolves null when mammoth lacks _openZip or the zip lacks the part", async () => {
    win.mammoth = { convertToHtml: () => {} };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe(null);
    win.mammoth = {
      _openZip: () => Promise.resolve({ exists: () => false })
    };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe(null);
  });

  it("resolves null when the zip open rejects (never blocks conversion)", async () => {
    win.mammoth = { _openZip: () => Promise.reject(new Error("bad zip")) };
    await expect(S.detectDocxLanguage(new ArrayBuffer(0))).resolves.toBe(null);
  });
});

describe("wireDocxUpload: language hook + manual override semantics", () => {
  async function upload(detected) {
    const calls = { start: 0, detected: [] };
    win.mammoth = {
      convertToHtml: () => Promise.resolve({ value: "<p>body</p>", messages: [] }),
      _openZip: detected
        ? () =>
            Promise.resolve({
              exists: () => true,
              read: () => Promise.resolve(runsXml([[detected, many(detected === "fr" ? FR : EN, 10)]]))
            })
        : undefined
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
    S.wireDocxUpload(input, model, { ChangeSource: S.ChangeSource }, {
      onDocxStart: () => { calls.start++; },
      onLanguageDetected: (l) => { calls.detected.push(l); },
      onDocx: () => {}
    });
    input.dispatchEvent(new win.Event("change"));
    await new Promise((r) => setTimeout(r, 0));
    return calls;
  }

  it("signals onDocxStart then a confident detection", async () => {
    const calls = await upload("fr");
    expect(calls.start).toBe(1);
    expect(calls.detected).toEqual(["fr"]);
  });

  it("makes no detection signal when the document is ambiguous", async () => {
    const calls = await upload(null);
    expect(calls.start).toBe(1);
    expect(calls.detected).toEqual([]);
  });

  it("paste path never triggers detection (no mammoth involvement)", () => {
    // wirePaste has no detection wiring at all; the paste event below must
    // complete cleanup without touching language state.
    const el = document.createElement("div");
    const model = new S.DocumentModel("");
    const live = { element: el };
    let stored = "en";
    const fakeStorage = {
      getItem: () => stored,
      setItem: (k, v) => { stored = v; },
      removeItem: () => {}
    };
    S.wirePaste(live, model, { ChangeSource: S.ChangeSource }, {});
    const ev = new win.Event("paste", { bubbles: true, cancelable: true });
    ev.clipboardData = {
      getData: (t) => (t === "text/html" ? "<p>contenu français collé</p>" : "")
    };
    el.dispatchEvent(ev);
    expect(model.getHTML()).toContain("français");
    expect(S.i18n.getLanguage(fakeStorage)).toBe("en"); // untouched
  });
});
