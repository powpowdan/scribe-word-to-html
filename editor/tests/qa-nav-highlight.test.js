import { describe, it, expect, vi } from "vitest";
import { loadScribe } from "./_load.js";

// QA navigation highlight (qa-nav-highlight change): clicking an issue row
// or outline entry scrolls the target into view AND briefly flashes it via
// reveal.flash (scribe-flash). scrollIntoView is a happy-dom no-op, so it is
// asserted by the flash landing on the right element.

const win = loadScribe(["document-model.js", "cleanup.js", "source-map.js", "document-commands.js", "reveal.js", "qa-panel.js"]);
const S = win.Scribe;
const document = win.document;

function mount(model) {
  const live = document.createElement("div");
  live.innerHTML = model.getHTML();
  document.body.appendChild(live);
  const issuesEl = document.createElement("div");
  const outlineEl = document.createElement("div");
  S.qaPanel.mountQaPanel({
    model,
    liveRoot: live,
    outlineEl,
    issuesEl
  });
  return { live, issuesEl, outlineEl };
}

describe("QA navigation flashes the target", () => {
  it("clicking an issue row flashes the target element (id navigation)", () => {
    const model = new S.DocumentModel('<h2 id="a">A</h2><h4 id="b">B</h4>');
    const { live, issuesEl } = mount(model);
    const row = issuesEl.querySelector(".qa-skipped-level");
    expect(row).toBeTruthy();
    row.click();
    const flashed = live.querySelector(".scribe-flash");
    // Skipped-level issue carries id "b" (the h4) — id path navigates there.
    expect(flashed).toBeTruthy();
    expect(flashed.id).toBe("b");
  });

  it("clicking an issue row flashes the target element (locator navigation)", () => {
    const model = new S.DocumentModel("<h2>no id</h2><p>text</p>");
    const { live, issuesEl } = mount(model);
    const row = issuesEl.querySelector(".qa-heading-no-id");
    expect(row).toBeTruthy();
    row.click();
    const flashed = live.querySelector(".scribe-flash");
    expect(flashed).toBeTruthy();
    expect(flashed.tagName).toBe("H2"); // locator {kind: heading, index: 0}
  });

  it("clicking an outline entry flashes the heading", () => {
    const model = new S.DocumentModel('<h2 id="s1">One</h2><p>x</p>');
    const { live, outlineEl } = mount(model);
    const link = outlineEl.querySelector("a");
    expect(link).toBeTruthy();
    link.click();
    const flashed = live.querySelector(".scribe-flash");
    expect(flashed).toBeTruthy();
    expect(flashed.id).toBe("s1");
  });

  it("the flash class is cleared after the timeout", () => {
    vi.useFakeTimers();
    // The classic scripts run inside happy-dom's window and call its
    // setTimeout, which fake timers don't patch — route the window's
    // timers through the (patched) globals.
    win.setTimeout = (fn, ms) => setTimeout(fn, ms);
    win.clearTimeout = (id) => clearTimeout(id);
    const model = new S.DocumentModel("<h2>no id</h2>");
    const { live, issuesEl } = mount(model);
    issuesEl.querySelector(".qa-heading-no-id").click();
    expect(live.querySelector(".scribe-flash")).toBeTruthy();
    vi.advanceTimersByTime(1300);
    expect(live.querySelector(".scribe-flash")).toBeNull();
    vi.useRealTimers();
  });
});
