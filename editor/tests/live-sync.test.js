import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadScribe } from "./_load.js";

// Continuous focus-based sync (dual-view-editor spec: "Continuous
// synchronization between views") + scroll/selection preservation
// (view-linking spec) + tidy-on-commit (view-linking spec). Debounce timing
// is driven through injectable timer functions so vitest's fake timers work
// across the happy-dom window boundary.

const win = loadScribe([
  "document-model.js",
  "history.js",
  "cleanup.js",
  "format-html.js",
  "source-map.js",
  "code-view.js",
  "live-view.js",
  "sync.js"
]);
const S = win.Scribe;
const document = win.document;
const { DocumentModel, ChangeSource, createLiveView, createCodeView, wireSync } = S;

function setup(html, opts) {
  document.body.innerHTML = "";
  const liveEl = document.createElement("div");
  liveEl.id = "live";
  liveEl.contentEditable = "true";
  const codeEl = document.createElement("textarea");
  codeEl.id = "code";
  document.body.appendChild(liveEl);
  document.body.appendChild(codeEl);

  const model = new DocumentModel(html);
  const liveView = createLiveView(liveEl, model, { ChangeSource });
  const codeView = createCodeView(codeEl, model, { ChangeSource });
  const handle = wireSync(liveView, codeView, model, { ChangeSource }, opts);
  return { liveEl, codeEl, model, liveView, codeView, handle };
}

describe("continuous sync — debounced writes (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setupFake(html, opts) {
    return setup(html, Object.assign({ setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) }, opts));
  }

  it("code typing updates Live without a focus change after the debounce", () => {
    const { codeEl, liveEl } = setupFake("<p>initial</p>");
    codeEl.value = "<p>typed in code</p>";
    codeEl.dispatchEvent(new win.Event("input"));
    expect(liveEl.innerHTML).toBe("<p>initial</p>"); // not yet
    vi.advanceTimersByTime(250);
    expect(liveEl.innerHTML).toBe("<p>typed in code</p>");
  });

  it("live typing updates Code without a focus change after the debounce", () => {
    const { liveEl, codeEl } = setupFake("<p>initial</p>");
    liveEl.innerHTML = "<p>typed live</p>";
    liveEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(250);
    expect(codeEl.value).toBe("<p>typed live</p>");
  });

  it("debounce coalesces a burst of keystrokes into one commit", () => {
    const ctx = setupFake("<p>x</p>");
    let emissions = 0;
    ctx.model.subscribe(() => emissions++);
    for (let i = 0; i < 10; i++) {
      ctx.codeEl.value = "<p>x" + "a".repeat(i + 1) + "</p>";
      ctx.codeEl.dispatchEvent(new win.Event("input"));
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(250);
    expect(emissions).toBe(1);
    expect(ctx.model.getHTML()).toBe("<p>xaaaaaaaaaa</p>");
  });

  it("pending edits commit immediately on blur (view switch)", () => {
    const { codeEl, liveEl } = setupFake("<p>initial</p>");
    codeEl.value = "<p>edited</p>";
    codeEl.dispatchEvent(new win.Event("input"));
    codeEl.dispatchEvent(new win.Event("blur"));
    expect(liveEl.innerHTML).toBe("<p>edited</p>"); // no timer advance needed
  });

  it("follower re-render does not feed back (no edit loop)", () => {
    const { codeEl, model } = setupFake("<p>initial</p>");
    let emissions = 0;
    model.subscribe(() => emissions++);
    codeEl.value = "<p>once</p>";
    codeEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(250);
    expect(emissions).toBe(1);
    // Live re-rendered (follower) — dispatch nothing further, let timers run.
    vi.advanceTimersByTime(1000);
    expect(emissions).toBe(1);
    expect(model.getHTML()).toBe("<p>once</p>");
  });

  it("incomplete HTML mid-edit renders best-effort without error", () => {
    const { codeEl, liveEl } = setupFake("");
    codeEl.value = "<p>Hel";
    codeEl.dispatchEvent(new win.Event("input"));
    expect(() => vi.advanceTimersByTime(250)).not.toThrow();
    expect(liveEl.innerHTML.toLowerCase()).toContain("<p>hel");
  });

  it("flush() commits pending edits on demand (used on focus switch)", () => {
    const { codeEl, liveEl, handle } = setupFake("<p>a</p>");
    codeEl.value = "<p>b</p>";
    codeEl.dispatchEvent(new win.Event("input"));
    handle.flush();
    expect(liveEl.innerHTML).toBe("<p>b</p>");
    // Idempotent: a second flush is a no-op.
    handle.flush();
    expect(liveEl.innerHTML).toBe("<p>b</p>");
  });

  it("detach() stops further syncing", () => {
    const { codeEl, model, handle } = setupFake("<p>a</p>");
    handle.detach();
    codeEl.value = "<p>b</p>";
    codeEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(500);
    expect(model.getHTML()).toBe("<p>a</p>");
  });
});

describe("document history is unaffected by continuous sync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounced live/code writes are not captured; commands still are", () => {
    const ctx = setup("<p>x</p>", {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id)
    });
    const hist = S.mountHistory(ctx.model, {});
    expect(hist.canUndo()).toBe(false);

    ctx.codeEl.value = "<p>y</p>";
    ctx.codeEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(300);
    expect(hist.canUndo()).toBe(false); // 'code' source: not captured

    ctx.liveEl.innerHTML = "<p>z</p>";
    ctx.liveEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(300);
    expect(hist.canUndo()).toBe(false); // 'live' source: not captured

    ctx.model.setHTML("<p>cmd</p>", ChangeSource.command, "Some command");
    expect(hist.canUndo()).toBe(true);
    expect(hist.peekUndoLabel()).toBe("Some command");
  });
});

describe("Code view scroll/selection preservation on background refresh", () => {
  it("keeps scrollTop/selection across a model push while unfocused", () => {
    const { codeEl, model } = setup("<p>a</p>");
    codeEl.scrollTop = 480;
    codeEl.scrollLeft = 12;
    if (codeEl.setSelectionRange) codeEl.setSelectionRange(4, 8);

    // Hostile geometry: setting .value resets scroll, like real browsers do.
    const desc = Object.getOwnPropertyDescriptor(codeEl, "value") ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(codeEl), "value");
    Object.defineProperty(codeEl, "value", {
      get: desc.get,
      set(v) {
        desc.set.call(this, v);
        this.scrollTop = 0;
        this.scrollLeft = 0;
      },
      configurable: true
    });

    model.setHTML("<p>a</p>\n<p>b</p>", ChangeSource.command);
    expect(codeEl.value).toBe("<p>a</p>\n<p>b</p>");
    expect(codeEl.scrollTop).toBe(480); // restored, not reset
    expect(codeEl.scrollLeft).toBe(12);
    expect(codeEl.selectionStart).toBe(4);
    expect(codeEl.selectionEnd).toBe(8);
  });

  it("does not touch scroll when the textarea is focused", () => {
    const { codeEl, model } = setup("<p>a</p>");
    codeEl.focus();
    codeEl.scrollTop = 0;
    model.setHTML("<p>changed</p>", ChangeSource.command);
    expect(codeEl.value).toBe("<p>changed</p>");
    expect(codeEl.scrollTop).toBe(0);
  });
});

describe("Live view scroll-anchored re-render", () => {
  it("degrades to a plain re-render in zero-geometry environments", () => {
    const { liveEl, model } = setup("<p>a</p>");
    model.setHTML("<p>b</p>", ChangeSource.command);
    expect(liveEl.innerHTML).toBe("<p>b</p>");
  });

  it("restores the anchor position when geometry is available", () => {
    // Paragraph geometry comes from data-h: top = sum(heights above) - 200,
    // simulating a viewport scrolled 200px into the surface.
    const { liveEl, model } = setup(
      '<p data-h="100">a</p><p data-h="100">b</p><p data-h="100">c</p>'
    );
    const proto = Object.getPrototypeOf(liveEl.children[0]);
    const origGBCR = proto.getBoundingClientRect;
    proto.getBoundingClientRect = function () {
      let top = -200;
      const sibs = this.parentNode ? Array.from(this.parentNode.children) : [];
      for (const s of sibs) {
        if (s === this) break;
        top += Number(s.getAttribute("data-h") || 100);
      }
      const h = Number(this.getAttribute("data-h") || 100);
      return { top: top, bottom: top + h };
    };
    liveEl.getBoundingClientRect = () => ({ top: 0, bottom: 300 });

    let fakeScrollTop = 200;
    Object.defineProperty(liveEl, "scrollTop", {
      get: () => fakeScrollTop,
      set: (v) => { fakeScrollTop = v; },
      configurable: true
    });

    // Old layout: a(-200..-100) b(-100..0) c(0..100) -> top anchor is "c"
    // (path [2], beforeTop 0). New document grows a and b to 250px each:
    // c now sits at 300 -> delta +300 -> scrollTop 200 -> 500.
    model.setHTML('<p data-h="250">a</p><p data-h="250">b</p><p>c</p>', ChangeSource.command);

    expect(liveEl.innerHTML).toBe('<p data-h="250">a</p><p data-h="250">b</p><p>c</p>');
    expect(fakeScrollTop).toBe(500);
    proto.getBoundingClientRect = origGBCR;
  });
});

describe("tidy on commit (opt-in)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };

  it("off (default): hand-shaped whitespace is preserved verbatim", () => {
    const { codeEl, model } = setup("<p>a</p>", timers);
    const hand = "<p>a</p>    <p>spaced</p>";
    codeEl.value = hand;
    codeEl.dispatchEvent(new win.Event("input"));
    codeEl.dispatchEvent(new win.Event("blur"));
    expect(model.getHTML()).toBe(hand);
    expect(codeEl.value).toBe(hand);
  });

  it("on: non-canonical commits are canonicalized (and reflected in the view)", () => {
    const { codeEl, model } = setup("<p>a</p>", Object.assign({ isTidyOnCommit: () => true }, timers));
    codeEl.value = "<p>a</p>  <ul><li>x</li></ul>";
    codeEl.dispatchEvent(new win.Event("input"));
    codeEl.dispatchEvent(new win.Event("blur"));
    expect(model.getHTML()).toBe("<p>a</p>\n<ul>\n  <li>x</li>\n</ul>");
    expect(codeEl.value).toBe(model.getHTML());
  });

  it("on: already-canonical input is byte-identical (idempotence)", () => {
    const { codeEl, model } = setup("<p>a</p>", Object.assign({ isTidyOnCommit: () => true }, timers));
    const canonical = "<p>a</p>\n<hr>\n<blockquote>q</blockquote>";
    codeEl.value = canonical;
    codeEl.dispatchEvent(new win.Event("input"));
    codeEl.dispatchEvent(new win.Event("blur"));
    expect(model.getHTML()).toBe(canonical);
    expect(codeEl.value).toBe(canonical);
  });

  it("on: mid-typing debounce commits stay verbatim; tidying happens at flush only", () => {
    const { codeEl, model } = setup("", Object.assign({ isTidyOnCommit: () => true }, timers));
    codeEl.value = "<p>Hel"; // incomplete while typing
    codeEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(300);
    expect(model.getHTML()).toBe("<p>Hel"); // not tidied (would disrupt typing)
  });

  it("committing while a highlight/flash class is on the DOM never pollutes the model", () => {
    // The user hovers (hover-link) or just triggered a reveal flash, then
    // types in Live — the debounced commit must scrub the editor classes.
    const ctx = setup("<p>hello</p>", timers);
    ctx.liveEl.querySelector("p").classList.add("scribe-hover-linked", "scribe-flash");
    ctx.liveEl.dispatchEvent(new win.Event("input"));
    vi.advanceTimersByTime(300);
    expect(ctx.model.getHTML()).toBe("<p>hello</p>");
    expect(ctx.codeEl.value).not.toContain("scribe-");
  });
});
