import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Paste-first empty state (ui-shell spec): the hero overlays the Live view
// while the document is empty, collapses when content exists, returns when
// the document is emptied, and a dropped .docx delegates to the shared
// upload pipeline (single mammoth path); non-.docx drops are rejected.

const win = loadScribe(["document-model.js", "cleanup.js", "entry.js"]);
const S = win.Scribe;
const document = win.document;

function makeHero() {
  const hero = document.createElement("div");
  const live = document.createElement("div");
  document.body.appendChild(hero);
  document.body.appendChild(live);
  const dropped = [];
  const rejected = [];
  const ctl = S.wireEmptyHero(hero, live, {
    onDocxFile: (f) => dropped.push(f),
    onInvalidFile: (f) => rejected.push(f)
  });
  return { hero, live, dropped, rejected, ctl };
}

function dropEvent(fileName) {
  const e = new win.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", {
    value: { files: fileName ? [{ name: fileName }] : [] }
  });
  return e;
}

describe("paste-first hero", () => {
  it("update() toggles visibility both directions", () => {
    const { hero, ctl } = makeHero();
    hero.removeAttribute("hidden");
    ctl.update("<p>content</p>");
    expect(hero.hasAttribute("hidden")).toBe(true);
    ctl.update("");
    expect(hero.hasAttribute("hidden")).toBe(false);
    ctl.update("   ");
    expect(hero.hasAttribute("hidden")).toBe(false);
  });

  it("a dropped .docx is delegated to the upload path", () => {
    const { hero, dropped, rejected } = makeHero();
    hero.dispatchEvent(dropEvent("report.docx"));
    expect(dropped).toHaveLength(1);
    expect(dropped[0].name).toBe("report.docx");
    expect(rejected).toHaveLength(0);
  });

  it("a non-.docx drop is rejected, not converted", () => {
    const { hero, dropped, rejected } = makeHero();
    hero.dispatchEvent(dropEvent("photo.png"));
    expect(dropped).toHaveLength(0);
    expect(rejected).toHaveLength(1);
  });
});
