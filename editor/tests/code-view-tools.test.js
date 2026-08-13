import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Pure-logic coverage for the code-view power features (find/replace/regex/
// go-to-line/line-numbers). The UI wiring (mount) is verified in the browser.

const win = loadScribe(["code-view-tools.js"]);
const T = win.Scribe.codeViewTools;
const document = win.document;

describe("findAllMatches", () => {
  it("finds literal matches case-insensitively by default", () => {
    const m = T.findAllMatches("Hello hello HELLO", "hello");
    expect(m.length).toBe(3);
    expect(m[0]).toEqual({ start: 0, end: 5, match: "Hello" });
  });

  it("respects caseSensitive", () => {
    const m = T.findAllMatches("Hello hello", "Hello", { caseSensitive: true });
    expect(m.length).toBe(1);
    expect(m[0].start).toBe(0);
  });

  it("supports regex", () => {
    const m = T.findAllMatches("h1 h2 h3", "h[1-3]", { regex: true });
    expect(m.length).toBe(3);
  });

  it("escapes regex metacharacters in literal mode", () => {
    const m = T.findAllMatches("a.b a.x", "a.b"); // literal "."
    expect(m.length).toBe(1);
    expect(m[0].match).toBe("a.b");
  });

  it("returns [] for empty query", () => {
    expect(T.findAllMatches("text", "")).toEqual([]);
  });

  it("returns [] for an invalid regex", () => {
    expect(T.findAllMatches("text", "(unclosed", { regex: true })).toEqual([]);
  });

  it("does not loop forever on a zero-length regex match", () => {
    const m = T.findAllMatches("abc", "x*", { regex: true });
    expect(Array.isArray(m)).toBe(true);
  });
});

describe("nextMatchIndex / prevMatchIndex", () => {
  const matches = [
    { start: 0, end: 1 },
    { start: 5, end: 6 },
    { start: 10, end: 11 }
  ];

  it("next: first match at or after pos, wrapping to 0", () => {
    expect(T.nextMatchIndex(matches, 0)).toBe(0);
    expect(T.nextMatchIndex(matches, 6)).toBe(2);
    expect(T.nextMatchIndex(matches, 99)).toBe(0); // wrap
  });

  it("prev: last match strictly before pos, wrapping to last", () => {
    expect(T.prevMatchIndex(matches, 10)).toBe(1);
    expect(T.prevMatchIndex(matches, 0)).toBe(2); // wrap to last
  });

  it("returns -1 when there are no matches", () => {
    expect(T.nextMatchIndex([], 0)).toBe(-1);
    expect(T.prevMatchIndex([], 0)).toBe(-1);
  });
});

describe("replaceOneAt / replaceAll", () => {
  it("replaces a single literal match at an index", () => {
    const text = "foo bar foo";
    const matches = T.findAllMatches(text, "foo");
    const r = T.replaceOneAt(text, "foo", "X", {}, 0);
    expect(r.text).toBe("X bar foo");
    expect(r.count).toBe(1);
    // matches stays a valid reference for index math; ignore unused-var lint:
    expect(matches.length).toBe(2);
  });

  it("replaceAll replaces every literal match and counts them", () => {
    const r = T.replaceAll("foo bar foo", "foo", "baz");
    expect(r.text).toBe("baz bar baz");
    expect(r.count).toBe(2);
  });

  it("regex replace supports backreferences", () => {
    // Captures optional slash + tag name; replacement reuses both groups.
    const r = T.replaceAll("<h1>x</h1>", "(</?)(h[1-6])>", '$1$2 class="x">', { regex: true });
    expect(r.text).toBe('<h1 class="x">x</h1 class="x">');
    expect(r.count).toBe(2);
  });

  it("replaceAll returns count 0 and unchanged text when nothing matches", () => {
    const r = T.replaceAll("nothing here", "zzz", "y");
    expect(r.count).toBe(0);
    expect(r.text).toBe("nothing here");
  });
});

describe("lineCount / lineStartOffset / gutterText", () => {
  it("counts lines (empty string = 1)", () => {
    expect(T.lineCount("")).toBe(1);
    expect(T.lineCount("one")).toBe(1);
    expect(T.lineCount("a\nb\nc")).toBe(3);
  });

  it("offset of a line start; -1 when out of range", () => {
    expect(T.lineStartOffset("a\nb\nc", 1)).toBe(0);
    expect(T.lineStartOffset("a\nb\nc", 2)).toBe(2);
    expect(T.lineStartOffset("a\nb\nc", 3)).toBe(4);
    expect(T.lineStartOffset("a\nb\nc", 4)).toBe(-1);
    expect(T.lineStartOffset("a\nb\nc", 0)).toBe(-1);
  });

  it("gutterText builds a 1-based newline-separated list", () => {
    expect(T.gutterText(3)).toBe("1\n2\n3");
    expect(T.gutterText(1)).toBe("1");
  });
});

// ----- Regression: typing in the find box must not steal focus -----
describe("Find input: recompute does not focus the textarea", () => {
  it("typing in the find input leaves textarea.focus untouched", () => {
    const ta = document.createElement("textarea");
    ta.value = "hello world hello";
    const fi = document.createElement("input");
    const panel = document.createElement("div");
    const status = document.createElement("span");
    document.body.appendChild(ta);
    document.body.appendChild(fi);

    T.mountCodeViewTools({
      textarea: ta,
      findPanel: panel,
      findInput: fi,
      statusEl: status
    });

    // Spy on ta.focus AFTER mount (internal calls resolve ta.focus at call time).
    let focusCalls = 0;
    ta.focus = () => { focusCalls++; };

    // Simulate the user typing in the find box.
    fi.value = "hello";
    fi.dispatchEvent(new win.Event("input", { bubbles: true }));

    expect(focusCalls).toBe(0); // the regression: recompute used to call ta.focus()
    // Status still updates, proving recompute ran ("hello world hello" => 2 hits).
    expect(status.textContent).toContain("1 of 2");
  });
});
