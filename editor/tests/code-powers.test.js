import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Code-view micro-powers (code-editing-power spec): $99 backreferences,
// Alt+W wrap-with-tag, Tab/Shift+Tab block indent/outdent.

const win = loadScribe(["document-model.js", "code-view-tools.js"]);
const S = win.Scribe;
const document = win.document;

describe("backreferences up to $99", () => {
  const T = S.codeViewTools;

  it("expands a two-digit group", () => {
    const groups = Array.from({ length: 12 }, (_, i) => "g" + (i + 1));
    const out = T.applyBackreferences("<$12>", ["full"].concat(groups));
    expect(out).toBe("<g12>");
  });

  it("disambiguates $9 vs $10 (longest digit run wins)", () => {
    const groups = Array.from({ length: 10 }, (_, i) => "g" + (i + 1));
    expect(T.applyBackreferences("[$9][$10]", ["full"].concat(groups))).toBe("[g9][g10]");
  });

  it("single-digit behavior unchanged and undefined groups stay literal", () => {
    expect(T.applyBackreferences("$1-$2", ["full", "a", "b"])).toBe("a-b");
    expect(T.applyBackreferences("$3", ["full", "a"])).toBe("$3");
    expect(T.applyBackreferences("no refs", ["full"])).toBe("no refs");
  });

  it("replace-all applies two-digit backreferences across matches", () => {
    const text = "a1 b2 c3";
    const out = T.replaceAll(text, "(\\w)(\\d)", "$2$1", { regex: true });
    expect(out.text).toBe("1a 2b 3c");
  });
});

describe("wrapSelection", () => {
  const T = S.codeViewTools;

  it("wraps a selection with a bare tag", () => {
    const r = T.wrapSelection("aXb", 1, 2, "figure");
    expect(r.value).toBe("a<figure>X</figure>b");
    expect(r.start).toBe(1);
    expect(r.end).toBe(2);
  });

  it("wraps with attributes and keeps the selection on the content", () => {
    const r = T.wrapSelection("abcdef", 2, 4, 'figure class="fig"');
    expect(r.value).toBe('ab<figure class="fig">cd</figure>ef');
    expect(r.start).toBe(2);
    expect(r.end).toBe(4);
  });

  it("wraps a multi-line selection", () => {
    // [2,8) selects "AB\nCD\n" (indices 2-7) — the trailing newline rides
    // along because it is part of the selection.
    const r = T.wrapSelection("x\nAB\nCD\ny", 2, 8, "div");
    expect(r.value).toBe("x\n<div>AB\nCD\n</div>y");
  });

  it("returns null for invalid specs", () => {
    expect(T.wrapSelection("abc", 0, 1, "")).toBe(null);
    expect(T.wrapSelection("abc", 0, 1, "1bad")).toBe(null);
    expect(T.wrapSelection("abc", 0, 1, 'p class="x>y"')).toBe(null);
  });
});

describe("indentSelection", () => {
  const T = S.codeViewTools;
  const IND = "    ";

  it("indents a three-line selection and preserves it", () => {
    const text = "one\ntwo\nthree";
    const r = T.indentSelection(text, 0, text.length, "in");
    expect(r.value.split("\n")).toEqual([IND + "one", IND + "two", IND + "three"]);
    expect(r.start).toBe(0);
    expect(r.end).toBe(text.length + 3 * IND.length);
  });

  it("outdents fully and partially indented lines", () => {
    const text = IND + "one\n  two\nthree";
    const r = T.indentSelection(text, 0, text.length, "out");
    expect(r.value).toBe("one\ntwo\nthree");
  });

  it("outdents by at most 4 spaces per line (deep indent keeps the rest)", () => {
    const text = "        deep"; // 8 spaces
    const r = T.indentSelection(text, 0, text.length, "out");
    expect(r.value).toBe("    deep");
  });

  it("selection spanning part of two lines transforms both whole lines", () => {
    // [3,7) selects "ha\nb" — the last selected char is the 'b', so both
    // the "alpha" and "beta" lines intersect and both indent.
    const text = "alpha\nbeta";
    const r = T.indentSelection(text, 3, 7, "in");
    expect(r.value).toBe(IND + "alpha\n" + IND + "beta");
  });

  it("selection ending exactly after a newline touches only the prior line", () => {
    // [3,6) selects "ha\n" — the newline terminates "alpha"; "beta" is not
    // intersected, so only one line indents.
    const r = T.indentSelection("alpha\nbeta", 3, 6, "in");
    expect(r.value).toBe(IND + "alpha\nbeta");
  });

  it("block ending with a newline does not gain a spurious indented line", () => {
    const text = "a\nb\n";
    const r = T.indentSelection(text, 0, text.length, "in");
    expect(r.value).toBe(IND + "a\n" + IND + "b\n");
    expect(r.value).not.toMatch(/\n +$/);
  });

  it("no selection: Tab inserts 4 spaces at the caret", () => {
    const r = T.indentSelection("ab", 1, 1, "in");
    expect(r.value).toBe("a" + IND + "b");
    expect(r.start).toBe(1 + IND.length);
    expect(r.end).toBe(1 + IND.length);
  });

  it("no selection: Shift+Tab outdents the caret's line, caret follows", () => {
    const text = "x\n" + IND + "mid\ndle";
    const caret = 2 + IND.length + 1; // inside "mid"
    const r = T.indentSelection(text, caret, caret, "out");
    expect(r.value).toBe("x\nmid\ndle");
    expect(r.start).toBe(2 + 1);
  });
});

describe("mounted textarea: Tab and Alt+W wiring", () => {
  function mount(value) {
    const ta = document.createElement("textarea");
    ta.value = value;
    document.body.appendChild(ta);
    S.codeViewTools.mountCodeViewTools({ textarea: ta });
    return ta;
  }
  function key(ta, opts) {
    const e = new win.KeyboardEvent("keydown", Object.assign({ cancelable: true, bubbles: true }, opts));
    ta.dispatchEvent(e);
    return e;
  }

  it("Tab indents the selected block and keeps focus in the textarea", () => {
    const ta = mount("one\ntwo");
    ta.focus();
    ta.setSelectionRange(0, 7);
    const e = key(ta, { key: "Tab" });
    expect(e.defaultPrevented).toBe(true);
    expect(ta.value).toBe("    one\n    two");
    expect(document.activeElement).toBe(ta);
    ta.remove();
  });

  it("Shift+Tab outdents", () => {
    const ta = mount("    a\n    b");
    ta.setSelectionRange(0, 12);
    key(ta, { key: "Tab", shiftKey: true });
    expect(ta.value).toBe("a\nb");
    ta.remove();
  });

  it("Tab with no selection inserts 4 spaces at the caret", () => {
    const ta = mount("ab");
    ta.setSelectionRange(1, 1);
    key(ta, { key: "Tab" });
    expect(ta.value).toBe("a    b");
    ta.remove();
  });

  it("Alt+W wraps the selection from the prompt", () => {
    const ta = mount("before AFTER after");
    ta.setSelectionRange(7, 12); // "AFTER"
    const realPrompt = win.prompt;
    win.prompt = () => 'figure class="fig"';
    key(ta, { key: "w", altKey: true });
    win.prompt = realPrompt;
    expect(ta.value).toBe('before <figure class="fig">AFTER</figure> after');
    ta.remove();
  });

  it("Alt+W cancel or empty answer is a no-op", () => {
    const ta = mount("same");
    ta.setSelectionRange(0, 4);
    const realPrompt = win.prompt;
    win.prompt = () => null;
    key(ta, { key: "w", altKey: true });
    win.prompt = () => "  ";
    key(ta, { key: "W", altKey: true });
    win.prompt = realPrompt;
    expect(ta.value).toBe("same");
    ta.remove();
  });
});
