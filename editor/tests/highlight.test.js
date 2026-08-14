import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Coverage for the Code-view syntax highlighter: the tokenizer and emitter are
// pure functions; the overlay mount is exercised via the custom
// 'scribe:code-write' signal, including an end-to-end pass through the
// document model (paste -> code view -> overlay updates).

const win = loadScribe(["document-model.js", "code-view.js", "highlight.js"]);
const S = win.Scribe;
const document = win.document;

describe("tokenizeHTML", () => {
  it("splits a tag with attributes into punct/tag/attr/value tokens", () => {
    const toks = S.tokenizeHTML('<p class="x">hi</p>');
    expect(toks).toEqual([
      { type: "punct", text: "<" },
      { type: "tag", text: "p" },
      { type: "text", text: " " },
      { type: "attr", text: "class" },
      { type: "punct", text: "=" },
      { type: "value", text: '"x"' },
      { type: "punct", text: ">" },
      { type: "text", text: "hi" },
      { type: "punct", text: "</" },
      { type: "tag", text: "p" },
      { type: "punct", text: ">" }
    ]);
  });

  it("tokenizes comments and doctypes whole", () => {
    const toks = S.tokenizeHTML("<!DOCTYPE html><!-- a note --><p>x</p>");
    expect(toks.find((t) => t.type === "doctype").text).toBe("<!DOCTYPE html>");
    expect(toks.find((t) => t.type === "comment").text).toBe("<!-- a note -->");
  });

  it("handles self-closing tags and unquoted values", () => {
    const toks = S.tokenizeHTML('<br/><input type=text>');
    expect(toks).toContainEqual({ type: "punct", text: "/>" });
    expect(toks).toContainEqual({ type: "value", text: "text" });
  });

  it("treats a stray '<' as text", () => {
    const toks = S.tokenizeHTML("a < b");
    expect(toks.every((t) => t.type === "text")).toBe(true);
  });

  it("keeps an unclosed tag from swallowing the rest as one token stream", () => {
    const toks = S.tokenizeHTML("<p>text");
    expect(toks.find((t) => t.type === "tag").text).toBe("p");
    expect(toks).toContainEqual({ type: "text", text: "text" });
  });
});

describe("highlightHTML (emitter)", () => {
  it("wraps tokens in classed spans and escapes content", () => {
    const out = S.highlightHTML('<p class="a">x</p>');
    expect(out).toContain('<span class="tok-tag">p</span>');
    expect(out).toContain('<span class="tok-attr">class</span>');
    expect(out).toContain('<span class="tok-value">&quot;a&quot;</span>');
    expect(out).toContain('<span class="tok-punct">&lt;</span>');
  });

  it("escapes text content — raw source markup never leaks unescaped", () => {
    const out = S.highlightHTML('<p><script>alert(1)</script></p>');
    // The <script> tag itself is a tag token (fine), but its content is text:
    expect(out).toContain('<span class="tok-tag">script</span>');
    expect(out).not.toContain("alert(1)</span><"); // no raw trailing markup glued on
    // Crucially the output is well-formed enough to innerHTML without
    // creating elements: no raw < followed by script outside spans.
    expect(out).not.toMatch(/<script/);
  });

  it("wraps character entities in text with the entity class", () => {
    const out = S.highlightHTML("<p>FedDev&nbsp;Ontario</p>");
    expect(out).toContain('<span class="tok-entity">&amp;nbsp;</span>');
    expect(out).toContain("FedDev");
  });

  it("ends with a newline so overlay height matches a trailing-newline textarea", () => {
    expect(S.highlightHTML("<p>a</p>").endsWith("\n")).toBe(true);
  });
});

describe("mountCodeHighlight (overlay wiring)", () => {
  function makePair() {
    const ta = document.createElement("textarea");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.appendChild(code);
    document.body.appendChild(ta);
    document.body.appendChild(pre);
    return { ta, pre, code };
  }

  it("highlights the initial value on mount", () => {
    const { ta, code } = makePair();
    ta.value = "<p>hello</p>";
    S.mountCodeHighlight({ textarea: ta, pre: makePair().pre, codeEl: code });
    expect(code.innerHTML).toContain('<span class="tok-tag">p</span>');
  });

  it("updates on typing (input) and on programmatic writes (scribe:code-write)", () => {
    const { ta, pre, code } = makePair();
    S.mountCodeHighlight({ textarea: ta, pre, codeEl: code });

    ta.value = "<h2>title</h2>";
    ta.dispatchEvent(new win.Event("input", { bubbles: true }));
    expect(code.innerHTML).toContain('<span class="tok-tag">h2</span>');

    ta.value = "<ul><li>x</li></ul>";
    ta.dispatchEvent(new win.Event("scribe:code-write"));
    expect(code.innerHTML).toContain('<span class="tok-tag">ul</span>');
    expect(code.innerHTML).not.toContain("h2");
  });
});

describe("integration: model -> code view -> overlay", () => {
  it("a paste into the model updates the textarea AND the highlight overlay", () => {
    const ta = document.createElement("textarea");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.appendChild(code);
    document.body.appendChild(ta);

    const model = new S.DocumentModel("");
    S.createCodeView(ta, model, { ChangeSource: S.ChangeSource });
    S.mountCodeHighlight({ textarea: ta, pre, codeEl: code });

    model.setHTML("<table><tbody><tr><td>1</td></tr></tbody></table>", S.ChangeSource.paste);

    expect(ta.value).toContain("<table>");
    expect(code.innerHTML).toContain('<span class="tok-tag">table</span>');
    expect(code.innerHTML).toContain('<span class="tok-tag">td</span>');
  });
});
