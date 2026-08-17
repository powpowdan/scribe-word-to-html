import { describe, it, expect, beforeEach } from "vitest";
import { loadScribe } from "./_load.js";

// WET component insertion (wet-components spec) + the Small text block-format
// option (wysiwyg-formatting delta). Builders are pure; the mounter is wired
// through happy-dom Selection/Range the same way wysiwyg.test.js does.

const win = loadScribe([
  "document-model.js",
  "history.js",
  "cleanup.js",
  "wysiwyg.js",
  "components.js"
]);
const S = win.Scribe;
const document = win.document;

const SKEL = "\u2026";

describe("buildComponent: panels", () => {
  it("emits panel panel-<variant> for every variant", () => {
    ["default", "info", "success", "warning", "danger"].forEach((v) => {
      const html = S.components.buildComponent("panel", { variant: v });
      expect(html.startsWith('<div class="panel panel-' + v + '">')).toBe(true);
      expect(html.endsWith("</div>")).toBe(true);
    });
  });

  it("heading and footer options add their structure; without them only the body", () => {
    const full = S.components.buildComponent("panel", { variant: "info", heading: true, footer: true });
    expect(full).toContain('<header class="panel-heading"><h5 class="panel-title">' + SKEL + "</h5></header>");
    expect(full).toContain('<div class="panel-body"><p>' + SKEL + "</p></div>");
    expect(full).toContain('<footer class="panel-footer">' + SKEL + "</footer>");
    const bare = S.components.buildComponent("panel", { variant: "info" });
    expect(bare).not.toContain("panel-heading");
    expect(bare).not.toContain("panel-footer");
    expect(bare).toContain("panel-body");
  });

  it("falls back to the first variant for unknown variants and null for unknown kinds", () => {
    expect(S.components.buildComponent("panel", { variant: "nope" })).toContain("panel-default");
    expect(S.components.buildComponent("widget", {})).toBe(null);
  });
});

describe("buildComponent: alerts, buttons, wells", () => {
  it("emits alert alert-<variant> with optional h3", () => {
    const a = S.components.buildComponent("alert", { variant: "warning", heading: true });
    expect(a.startsWith('<section class="alert alert-warning">')).toBe(true);
    expect(a).toContain("<h3>" + SKEL + "</h3>");
    expect(a).toContain("<p>" + SKEL + "</p>");
    const bare = S.components.buildComponent("alert", { variant: "danger" });
    expect(bare).not.toContain("<h3>");
  });

  it("default button is exactly btn; others add btn-<variant>", () => {
    expect(S.components.buildComponent("button", { variant: "default" })).toBe(
      '<button type="button" class="btn">' + SKEL + "</button>"
    );
    expect(S.components.buildComponent("button", { variant: "primary" })).toBe(
      '<button type="button" class="btn btn-primary">' + SKEL + "</button>"
    );
    ["success", "info", "warning", "danger", "link"].forEach((v) => {
      expect(S.components.buildComponent("button", { variant: v })).toContain('btn btn-' + v);
    });
  });

  it("wells map default/small/large to well / well-sm / well-lg", () => {
    expect(S.components.buildComponent("well", { variant: "default" })).toBe(
      '<div class="well"><p>' + SKEL + "</p></div>"
    );
    expect(S.components.buildComponent("well", { variant: "small" })).toContain('class="well well-sm"');
    expect(S.components.buildComponent("well", { variant: "large" })).toContain('class="well well-lg"');
  });

  it("skeleton text is the neutral ellipsis regardless of options", () => {
    Object.keys(S.components.CATALOG).forEach((kind) => {
      const html = S.components.buildComponent(kind, { heading: true, footer: true });
      expect(html).toContain(SKEL);
      expect(html).not.toContain("Footnote");
    });
  });
});

// ---- Mounted dropdown ----

function mountForm(liveRoot, overrides) {
  overrides = overrides || {};
  const panel = document.createElement("div");
  panel.setAttribute("hidden", "");
  const toggle = document.createElement("button");
  const kindSelect = document.createElement("select");
  Object.keys(S.components.CATALOG).forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    kindSelect.appendChild(o);
  });
  kindSelect.value = "panel";
  const variantSelect = document.createElement("select");
  const headingChk = document.createElement("input");
  headingChk.type = "checkbox";
  const headingLabel = document.createElement("label");
  headingLabel.appendChild(headingChk);
  const footerChk = document.createElement("input");
  footerChk.type = "checkbox";
  const footerLabel = document.createElement("label");
  footerLabel.appendChild(footerChk);
  const insertBtn = document.createElement("button");
  const commands = [];
  const api = S.components.mountComponents(Object.assign({
    liveRoot,
    toggle,
    panel,
    kindSelect,
    variantSelect,
    headingChk,
    footerChk,
    insertBtn,
    command: (label) => commands.push(label)
  }, overrides));
  return { api, panel, toggle, kindSelect, variantSelect, headingChk, footerChk, footerLabel, headingLabel, insertBtn, commands };
}

function caretIn(el) {
  const r = document.createRange();
  r.setStart(el, 0);
  r.setEnd(el, 0);
  const sel = document.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
}

describe("mounted dropdown: form follows the kind", () => {
  it("variant options swap per kind and contextual checkboxes show/hide", () => {
    const live = document.createElement("div");
    document.body.appendChild(live);
    const f = mountForm(live);
    expect(f.variantSelect.options.length).toBe(5); // panel variants
    f.kindSelect.value = "button";
    f.kindSelect.dispatchEvent(new win.Event("change"));
    expect(Array.from(f.variantSelect.options).map((o) => o.value)).toEqual(
      ["default", "primary", "success", "info", "warning", "danger", "link"]
    );
    expect(f.headingLabel.style.display).toBe("none");
    f.kindSelect.value = "alert";
    f.kindSelect.dispatchEvent(new win.Event("change"));
    expect(f.headingLabel.style.display).toBe("");
    f.api.detach();
    live.remove();
  });

  it("toggle opens and closes the panel", () => {
    const live = document.createElement("div");
    document.body.appendChild(live);
    const f = mountForm(live);
    f.toggle.dispatchEvent(new win.Event("click"));
    expect(f.panel.hasAttribute("hidden")).toBe(false);
    expect(f.toggle.getAttribute("aria-expanded")).toBe("true");
    f.toggle.dispatchEvent(new win.Event("click"));
    expect(f.panel.hasAttribute("hidden")).toBe(true);
    f.api.detach();
    live.remove();
  });
});

describe("mounted insertion", () => {
  function setup(docHtml) {
    const live = document.createElement("div");
    live.innerHTML = docHtml;
    document.body.appendChild(live);
    return live;
  }

  it("inserts a block component after the caret's block, as a labeled command", () => {
    const live = setup("<p id='a'>first</p><p id='b'>second</p>");
    const f = mountForm(live);
    caretIn(live.querySelector("#b").firstChild);
    f.insertBtn.dispatchEvent(new win.Event("click"));
    const panel = live.querySelector(".panel");
    expect(panel).toBeTruthy();
    expect(panel.previousElementSibling.id).toBe("b"); // right after the block
    expect(f.commands).toEqual(["Insert panel"]);
    f.api.detach();
    live.remove();
  });

  it("insertion is undoable through document history", () => {
    const model = new S.DocumentModel("<p id='a'>first</p><p id='b'>second</p>");
    const ctl = S.mountHistory(model, {});
    const live = setup(model.getHTML());
    const f = mountForm(live, {
      command: (label) => model.setHTML(live.innerHTML, "command", label)
    });
    caretIn(live.querySelector("#b").firstChild);
    f.insertBtn.dispatchEvent(new win.Event("click"));
    expect(model.getHTML()).toContain("panel");
    const entry = ctl.undoAction();
    expect(entry.label).toBe("Insert panel");
    expect(model.getHTML()).not.toContain("panel");
    ctl.detach();
    f.api.detach();
    live.remove();
  });

  it("button inserts inline at the caret inside the paragraph", () => {
    const live = setup("<p id='a'>some text</p>");
    const f = mountForm(live);
    f.kindSelect.value = "button";
    f.kindSelect.dispatchEvent(new win.Event("change"));
    f.variantSelect.value = "primary";
    caretIn(live.querySelector("p").firstChild);
    f.insertBtn.dispatchEvent(new win.Event("click"));
    const btn = live.querySelector("p > button.btn-primary");
    expect(btn).toBeTruthy();
    expect(live.children.length).toBe(1); // no new block-level sibling
    f.api.detach();
    live.remove();
  });

  it("no caret in the Live view appends at the document end", () => {
    const live = setup("<p id='a'>first</p>");
    const f = mountForm(live);
    document.getSelection().removeAllRanges();
    f.insertBtn.dispatchEvent(new win.Event("click"));
    const well = live.querySelector(".panel");
    expect(well).toBeTruthy();
    expect(well.previousElementSibling.id).toBe("a"); // last child
    f.api.detach();
    live.remove();
  });
});

// ---- Small text (wysiwyg-formatting delta) ----

describe("small text block-format option", () => {
  beforeEach(() => {
    document.execCommand = (...a) => (document._calls = (document._calls || []).concat([a]));
    document.queryCommandState = () => false;
    document._calls = [];
  });

  function blockSelect() {
    const sel = document.createElement("select");
    ["", "p", "h2", "small"].forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      sel.appendChild(o);
    });
    return sel;
  }

  it("toggles the small class on the current block without changing its type", () => {
    const live = document.createElement("div");
    live.innerHTML = '<p class="mrgn-lft-md" id="p1">text</p>';
    document.body.appendChild(live);
    const sel = blockSelect();
    S.wysiwyg.mountWysiwyg({ liveRoot: live, toolbar: document.createElement("div"), blockSelect: sel, onChange() {} });

    caretIn(live.querySelector("#p1").firstChild);
    sel.value = "small";
    sel.dispatchEvent(new win.Event("change"));
    const p = live.querySelector("#p1");
    expect(p.tagName).toBe("P");
    expect(p.classList.contains("small")).toBe(true);
    expect(p.classList.contains("mrgn-lft-md")).toBe(true); // other classes kept

    caretIn(p.firstChild);
    sel.value = "small";
    sel.dispatchEvent(new win.Event("change"));
    expect(p.classList.contains("small")).toBe(false);
    expect(document._calls.some((c) => c[0] === "formatBlock")).toBe(false);
    live.remove();
  });

  it("heading values still take the formatBlock path", () => {
    const live = document.createElement("div");
    live.innerHTML = "<p id='p1'>text</p>";
    document.body.appendChild(live);
    const sel = blockSelect();
    S.wysiwyg.mountWysiwyg({ liveRoot: live, toolbar: document.createElement("div"), blockSelect: sel, onChange() {} });
    caretIn(live.querySelector("#p1").firstChild);
    sel.value = "h2";
    sel.dispatchEvent(new win.Event("change"));
    expect(document._calls.some((c) => c[0] === "formatBlock" && c[2] === "<h2>")).toBe(true);
    live.remove();
  });
});

// ---- Cleanup / copy preservation (wet-components spec) ----

describe("component classes survive cleanup and copy", () => {
  it("sanitize keeps WET component classes on paste", () => {
    const html =
      '<div class="panel panel-info"><header class="panel-heading"><h5 class="panel-title">T</h5></header>' +
      '<div class="panel-body"><p>x</p></div><footer class="panel-footer">f</footer></div>' +
      '<section class="alert alert-warning"><h3>H</h3><p>p</p></section>' +
      '<div class="well well-sm"><p>w</p></div>' +
      '<p><button type="button" class="btn btn-primary">b</button></p>';
    const out = S.sanitizeWordHtml(html);
    expect(out).toContain('class="panel panel-info"');
    expect(out).toContain('class="panel-heading"');
    expect(out).toContain('class="panel-title"');
    expect(out).toContain('class="panel-body"');
    expect(out).toContain('class="panel-footer"');
    expect(out).toContain('class="alert alert-warning"');
    expect(out).toContain('class="well well-sm"');
    expect(out).toContain('class="btn btn-primary"');
  });

  it("non-WET classes are still stripped (mixed lists strip entirely)", () => {
    const out = S.sanitizeWordHtml('<p class="MsoNormal">x</p><p class="panel MsoNormal">y</p>');
    expect(out).not.toContain("MsoNormal");
    expect(out).not.toContain('class="panel');
  });

  it("Copy HTML serialization round-trips an inserted component", () => {
    const html = S.components.buildComponent("alert", { variant: "danger", heading: true });
    const model = new S.DocumentModel("<p>intro</p>" + html);
    const out = S.serializeForOutput(model.getHTML());
    expect(out).toContain('class="alert alert-danger"');
    expect(out).toContain("<h3>" + SKEL + "</h3>");
    expect(out).not.toContain("img-placeholder");
  });
});
