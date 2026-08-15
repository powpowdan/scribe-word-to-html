import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// QA panel issue-count badge (qa-panel spec, "Items to review"): the section
// heading shows the live count of detected issues; clean documents hide the
// badge (the "No issues found." row is the clean state).

const win = loadScribe(["document-model.js", "cleanup.js", "document-commands.js", "qa-panel.js"]);
const S = win.Scribe;
const document = win.document;

function mount() {
  const model = new S.DocumentModel("");
  const issuesEl = document.createElement("div");
  const countEl = document.createElement("span");
  countEl.setAttribute("hidden", "");
  S.qaPanel.mountQaPanel({
    model,
    outlineEl: document.createElement("div"),
    issuesEl,
    issuesCountEl: countEl
  });
  return { model, issuesEl, countEl };
}

describe("QA issue count badge", () => {
  it("shows the count while issues exist", () => {
    const { model, countEl } = mount();
    // h2 without id + skipped level (h2 → h4) + h4 without id = 3 issues.
    model.setHTML("<h2>Two</h2><h4>Four</h4>", "command");
    expect(countEl.hasAttribute("hidden")).toBe(false);
    expect(countEl.textContent).toBe("3");
  });

  it("updates as the document changes and hides on a clean document", () => {
    const { model, countEl } = mount();
    model.setHTML("<h2>Two</h2><h4>Four</h4>", "command");
    expect(countEl.textContent).toBe("3");
    model.setHTML('<h2 id="a">Clean</h2><p>fine</p>', "command");
    expect(countEl.hasAttribute("hidden")).toBe(true);
  });
});
