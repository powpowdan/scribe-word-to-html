import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// QA one-click fixes (qa-auto-fix spec): fixable issues expose an action,
// fixes apply in place through the model as labeled commands (undoable), and
// the panel re-lints after the fix.

const win = loadScribe([
  "document-model.js",
  "history.js",
  "cleanup.js",
  "i18n.js",
  "document-commands.js",
  "qa-panel.js"
]);
const S = win.Scribe;
const document = win.document;

describe("detectIssues: fix metadata", () => {
  const root = document.createElement("div");

  it("marks missing heading/table/figure ids as add-id fixable", () => {
    root.innerHTML = "<h2>Intro</h2><table><tr><td>a</td></tr></table><figure>x</figure>";
    const issues = S.qaPanel.detectIssues(root);
    const byType = Object.fromEntries(issues.map((i) => [i.type, i]));
    expect(byType["heading-no-id"].fix).toBe("add-id");
    expect(byType["table-no-id"].fix).toBe("add-id");
    expect(byType["figure-no-id"].fix).toBe("add-id");
  });

  it("marks empty/placeholder links as strip-link fixable", () => {
    root.innerHTML = '<p><a href="#">dead</a> and <a href="https://x">live</a></p>';
    const issues = S.qaPanel.detectIssues(root);
    const bad = issues.find((i) => i.type === "bad-link");
    expect(bad.fix).toBe("strip-link");
    expect(issues.filter((i) => i.type === "bad-link")).toHaveLength(1);
  });

  it("leaves unfixable issues (skipped level, empty heading) without a fix", () => {
    root.innerHTML = "<h1>T</h1><h3>skip</h3>";
    const issues = S.qaPanel.detectIssues(root);
    expect(issues.find((i) => i.type === "skipped-level").fix).toBeUndefined();
  });
});

describe("assignElementId: Add-IDs scheme scoped to one element", () => {
  it("heading gets a text slug with collision suffix", () => {
    const root = document.createElement("div");
    root.innerHTML = '<h2 id="intro">Intro</h2><h2>Intro</h2>';
    const second = root.querySelectorAll("h2")[1];
    expect(S.documentCommands.assignElementId(second, root)).toBe("intro-2");
  });

  it("table gets tbl-N positional among remaining id-less tables, avoiding collisions", () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<table id="tbl-2"></table><table></table><table></table>';
    const [first, second] = [root.querySelectorAll("table")[1], root.querySelectorAll("table")[2]];
    // First remaining id-less table -> base tbl-1 (free).
    expect(S.documentCommands.assignElementId(first, root)).toBe("tbl-1");
    // After that assignment the second is the only id-less table left, so
    // its base is again tbl-1 — taken now — and the collision suffix fires.
    expect(S.documentCommands.assignElementId(second, root)).toBe("tbl-1-2");
  });

  it("figure gets fig-N", () => {
    const root = document.createElement("div");
    root.innerHTML = "<figure>a</figure>";
    expect(S.documentCommands.assignElementId(root.querySelector("figure"), root)).toBe("fig-1");
  });

  it("matches addIds numbering for a full document", () => {
    // The id a single fix assigns equals the id a doc-wide Add IDs run would
    // have assigned to the same element.
    const mk = () => {
      const r = document.createElement("div");
      r.innerHTML = "<h2>Report</h2><table></table><table></table><p>t</p>";
      return r;
    };
    const fixRoot = mk();
    const target = fixRoot.querySelectorAll("table")[1];
    const fixed = S.documentCommands.assignElementId(target, fixRoot);
    const addIdsRoot = mk();
    S.documentCommands.addIds(addIdsRoot);
    expect(addIdsRoot.querySelectorAll("table")[1].id).toBe(fixed);
  });
});

describe("mounted panel: fix buttons apply, re-lint, and participate in undo", () => {
  function mountPanel(model) {
    const issuesEl = document.createElement("div");
    const panel = S.qaPanel.mountQaPanel({
      model,
      issuesEl,
      toaster: null
    });
    return { issuesEl, panel };
  }

  it("Add ID button assigns the scheme id and the issue disappears", () => {
    const model = new S.DocumentModel("<h2>Findings</h2><p>x</p>");
    const { issuesEl } = mountPanel(model);
    const li = issuesEl.querySelector(".qa-heading-no-id");
    expect(li).toBeTruthy();
    li.querySelector(".qa-fix-btn").click();
    expect(model.getHTML()).toContain('id="findings"');
    // Re-lint: the heading-no-id issue is gone.
    expect(issuesEl.querySelector(".qa-heading-no-id")).toBeNull();
  });

  it("Strip link keeps the anchor text", () => {
    const model = new S.DocumentModel('<p>See <a href="#">the guide</a> now.</p>');
    const { issuesEl } = mountPanel(model);
    issuesEl.querySelector(".qa-bad-link .qa-fix-btn").click();
    const html = model.getHTML();
    expect(html).toContain("the guide");
    expect(html).not.toContain("<a");
    expect(issuesEl.querySelector(".qa-bad-link")).toBeNull();
  });

  it("fixes are labeled commands and undoable via document history", () => {
    const model = new S.DocumentModel("<h2>Section</h2>");
    const ctl = S.mountHistory(model, {});
    const { issuesEl } = mountPanel(model);
    issuesEl.querySelector(".qa-heading-no-id .qa-fix-btn").click();
    expect(model.getHTML()).toContain('id="section"');
    const entry = ctl.undoAction();
    expect(entry.label).toBe("Add ID");
    expect(model.getHTML()).not.toContain('id="section"');
    ctl.detach();
  });

  it("fix button click applies the fix without triggering row navigation", () => {
    const model = new S.DocumentModel("<h2>Nav</h2>");
    const { issuesEl } = mountPanel(model);
    let navigated = false;
    const li = issuesEl.querySelector(".qa-heading-no-id");
    li.addEventListener("click", () => { navigated = true; });
    li.querySelector(".qa-fix-btn").click();
    expect(model.getHTML()).toContain('id="nav"'); // the fix ran exactly once
    expect(navigated).toBe(false); // stopPropagation: the row handler never fired
  });
});
