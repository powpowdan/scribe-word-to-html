import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// wireDocxUpload acceptance: mammoth output enters the model, and the Word
// comments mammoth renders ([Author1] anchors + trailing comment <dl>) are
// stripped before the model ever sees them.

const win = loadScribe(["document-model.js", "cleanup.js", "entry.js"]);
const S = win.Scribe;
const document = win.document;

async function uploadDocx(mammothHtml) {
  win.mammoth = {
    convertToHtml: () =>
      Promise.resolve({ value: mammothHtml, messages: [{ type: "info" }] })
  };
  class StubFileReader {
    readAsArrayBuffer() {
      this.onload({ target: { result: new ArrayBuffer(0) } });
    }
  }
  win.FileReader = StubFileReader;

  const input = document.createElement("input");
  input.type = "file";
  Object.defineProperty(input, "files", { value: [{ name: "doc.docx" }] });
  const model = new S.DocumentModel("");
  const hooked = [];
  S.wireDocxUpload(input, model, { ChangeSource: S.ChangeSource }, {
    onDocx: (info) => hooked.push(info)
  });
  input.dispatchEvent(new win.Event("change"));
  await new Promise((r) => setTimeout(r, 0));
  return { model, hooked };
}

describe("wireDocxUpload", () => {
  it("strips mammoth comment anchors and the comment dl before entering the model", async () => {
    const html =
      '<p>Text <a id="comment-ref-1" href="#comment-1">[DB1]</a> continues.</p>' +
      '<dl><dt id="comment-1">Comment [DB1]</dt><dd><p>please revise</p></dd></dl>';
    const { model } = await uploadDocx(html);
    const out = model.getHTML();
    expect(out).toContain("Text");
    expect(out).toContain("continues.");
    expect(out).not.toContain("[DB1]");
    expect(out).not.toContain("comment-ref-1");
    expect(out).not.toContain("<dl");
    expect(out).not.toContain("please revise");
  });

  it("passes comment-free mammoth output through unchanged", async () => {
    const { model } = await uploadDocx("<p>Plain <strong>bold</strong> body.</p>");
    expect(model.getHTML()).toBe("<p>Plain <strong>bold</strong> body.</p>");
  });

  it("still reports mammoth messages through the onDocx hook", async () => {
    const { hooked } = await uploadDocx("<p>x</p>");
    expect(hooked).toHaveLength(1);
    expect(hooked[0].messages).toEqual([{ type: "info" }]);
  });
});
