import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Pure-logic coverage for the footnote markup builders (WET wb-fnote pattern).
// The caret insertion (Selection/Range) is browser-verified.

const win = loadScribe(["footnotes.js"]);
const F = win.Scribe.footnotes;
const document = win.document;

function rootWith(html) {
  const root = document.createElement("div");
  root.innerHTML = html.trim();
  return root;
}

describe("buildFootnoteReference", () => {
  it("builds the WET in-body <sup> reference", () => {
    const sup = F.buildFootnoteReference(3);
    expect(sup.tagName).toBe("SUP");
    expect(sup.id).toBe("fn3-rf");
    const a = sup.querySelector("a.fn-lnk");
    expect(a).not.toBe(null);
    expect(a.getAttribute("href")).toBe("#fn3");
    expect(a.querySelector("span.wb-inv").textContent).toBe("Footnote ");
    // Visible number text node
    expect(a.textContent.replace("Footnote ", "")).toBe("3");
  });
});

describe("buildFootnoteEntry", () => {
  it("builds <dt> + <dd> with the footnote text and a return link", () => {
    const frag = F.buildFootnoteEntry(2, "Citation source.");
    const dt = frag.querySelector("dt");
    const dd = frag.querySelector("dd");
    expect(dt.textContent).toBe("Footnote 2");
    expect(dd.id).toBe("fn2");
    expect(dd.querySelector("p").textContent).toBe("Citation source.");
    const rtn = dd.querySelector("p.fn-rtn a");
    expect(rtn.getAttribute("href")).toBe("#fn2-rf");
    expect(rtn.textContent).toContain("2");
  });
});

describe("nextFootnoteNumber", () => {
  it("returns 1 when there are no footnotes", () => {
    expect(F.nextFootnoteNumber(rootWith("<p>none</p>"))).toBe(1);
  });

  it("returns max existing fn<digit> + 1", () => {
    const root = rootWith('<aside class="wb-fnote"><dl><dd id="fn1">a</dd><dd id="fn2">b</dd></dl></aside>');
    expect(F.nextFootnoteNumber(root)).toBe(3);
  });

  it("skips symbolic fn* ids", () => {
    const root = rootWith('<aside class="wb-fnote"><dl><dd id="fn1">a</dd><dd id="fn*">b</dd></dl></aside>');
    expect(F.nextFootnoteNumber(root)).toBe(2);
  });
});

describe("ensureFootnotesAside", () => {
  it("creates the <aside> with a Footnotes heading + <dl> when absent, returns the dl", () => {
    const root = rootWith("<p>doc</p>");
    const dl = F.ensureFootnotesAside(root);
    const aside = root.querySelector("aside.wb-fnote");
    expect(aside).not.toBe(null);
    expect(aside.getAttribute("role")).toBe("note");
    expect(aside.querySelector("h2#fn").textContent).toBe("Footnotes");
    expect(dl.tagName).toBe("DL");
  });

  it("reuses the existing aside and does not duplicate", () => {
    const root = rootWith('<aside class="wb-fnote"><h2 id="fn">Footnotes</h2><dl><dd id="fn1">x</dd></dl></aside>');
    F.ensureFootnotesAside(root);
    F.ensureFootnotesAside(root);
    expect(root.querySelectorAll("aside.wb-fnote")).toHaveLength(1);
    expect(F.nextFootnoteNumber(root)).toBe(2);
  });

  it("appended entry lands in the dl and bumps the next number", () => {
    const root = rootWith("<p>doc</p>");
    const dl = F.ensureFootnotesAside(root);
    dl.appendChild(F.buildFootnoteEntry(1, "first"));
    expect(root.querySelectorAll("aside.wb-fnote dd")).toHaveLength(1);
    expect(F.nextFootnoteNumber(root)).toBe(2);
  });
});
