import { describe, it, expect } from "vitest";
import { loadScribe } from "./_load.js";

// Headless coverage for document recovery (autosave + restore prompt) and the
// toaster. The debounce + storage interactions are exercised via an injected
// fake timer and a fake storage so nothing touches real localStorage or wall-
// clock time.

const win = loadScribe(["document-model.js", "document-recovery.js", "toasts.js"]);
const S = win.Scribe;
const document = win.document;

// Minimal localStorage-like map for tests.
function fakeStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _raw: store
  };
}

// Minimal controllable timer (env-independent).
function fakeTimer() {
  const jobs = []; // { fn, time, id }
  let now = 0;
  let nextId = 1;
  return {
    setTimeout(fn, ms) {
      const id = nextId++;
      jobs.push({ fn, time: now + (ms || 0), id });
      return id;
    },
    clearTimeout(id) {
      const i = jobs.findIndex((j) => j.id === id);
      if (i >= 0) jobs.splice(i, 1);
    },
    advance(ms) {
      now += ms;
      for (const j of Array.from(jobs)) {
        if (j.time <= now) {
          const i = jobs.indexOf(j);
          if (i >= 0) jobs.splice(i, 1);
          j.fn();
        }
      }
    },
    pending() {
      return jobs.length;
    }
  };
}

describe("recovery: record serialize / parse", () => {
  it("round-trips a record", () => {
    const R = S.documentRecovery;
    const s = R.serializeRecord("<p>hi</p>", 1000);
    const r = R.parseRecord(s);
    expect(r.v).toBe(R.RECOVERY_VERSION);
    expect(r.html).toBe("<p>hi</p>");
    expect(r.savedAt).toBe(1000);
  });

  it("rejects malformed / wrong-version records", () => {
    const R = S.documentRecovery;
    expect(R.parseRecord(null)).toBe(null);
    expect(R.parseRecord("not json")).toBe(null);
    expect(R.parseRecord(JSON.stringify({ v: 999, html: "x" }))).toBe(null); // wrong version
    expect(R.parseRecord(JSON.stringify({ v: 1, html: 5 }))).toBe(null); // bad html type
    expect(R.parseRecord(JSON.stringify({ v: 1, html: "x", savedAt: "z" }))).toBe(null); // bad savedAt
  });
});

describe("recovery: shouldPrompt", () => {
  const R = S.documentRecovery;
  it("prompts when recovery is non-empty and differs from current", () => {
    expect(R.shouldPrompt({ v: 1, html: "<p>saved</p>", savedAt: 1 }, "")).toBe(true);
  });
  it("does not prompt when recovery is empty/whitespace", () => {
    expect(R.shouldPrompt({ v: 1, html: "   ", savedAt: 1 }, "")).toBe(false);
  });
  it("does not prompt when recovery equals current", () => {
    expect(R.shouldPrompt({ v: 1, html: "<p>x</p>", savedAt: 1 }, "<p>x</p>")).toBe(false);
  });
  it("does not prompt when there is no recovery", () => {
    expect(R.shouldPrompt(null, "")).toBe(false);
  });
});

describe("recovery: createRecovery (autosave + debounce)", () => {
  it("does not save before the debounce window elapses", () => {
    const storage = fakeStorage();
    const t = fakeTimer();
    const model = new S.DocumentModel("");
    const rec = S.documentRecovery.createRecovery({
      storage,
      model,
      debounceMs: 800,
      timer: t
    });
    rec.start();
    model.setHTML("<p>editing</p>", S.ChangeSource.live);
    expect(t.pending()).toBe(1);
    t.advance(799);
    expect(storage.getItem(S.documentRecovery.DEFAULT_KEY)).toBe(null); // not yet
    expect(t.pending()).toBe(1);
  });

  it("saves after the debounce window elapses", () => {
    const storage = fakeStorage();
    const t = fakeTimer();
    const model = new S.DocumentModel("");
    const rec = S.documentRecovery.createRecovery({
      storage,
      model,
      debounceMs: 800,
      timer: t
    });
    rec.start();
    model.setHTML("<p>editing</p>", S.ChangeSource.live);
    t.advance(800);
    const stored = S.documentRecovery.parseRecord(storage.getItem(S.documentRecovery.DEFAULT_KEY));
    expect(stored.html).toBe("<p>editing</p>");
    expect(t.pending()).toBe(0);
  });

  it("coalesces rapid edits into a single debounced save", () => {
    const storage = fakeStorage();
    const t = fakeTimer();
    const model = new S.DocumentModel("");
    const rec = S.documentRecovery.createRecovery({
      storage,
      model,
      debounceMs: 500,
      timer: t
    });
    rec.start();
    model.setHTML("a", S.ChangeSource.live);
    t.advance(300);
    model.setHTML("b", S.ChangeSource.live);
    t.advance(300);
    model.setHTML("c", S.ChangeSource.live);
    t.advance(500);
    const stored = S.documentRecovery.parseRecord(storage.getItem(S.documentRecovery.DEFAULT_KEY));
    // Only the final value is saved.
    expect(stored.html).toBe("c");
  });

  it("discard removes the stored copy", () => {
    const storage = fakeStorage();
    storage.setItem(S.documentRecovery.DEFAULT_KEY, S.documentRecovery.serializeRecord("<p>x</p>", 1));
    const rec = S.documentRecovery.createRecovery({ storage, model: new S.DocumentModel("") });
    expect(rec.shouldPrompt("")).toBe(true);
    rec.discard();
    expect(rec.shouldPrompt("")).toBe(false);
  });
});

describe("toaster", () => {
  it("prepends a toast and caps the region to max", () => {
    const region = document.createElement("div");
    const t = S.createToaster(region, { max: 2, ttl: 99999, timer: fakeTimer() });
    t.show("one");
    t.show("two");
    t.show("three");
    expect(region.children.length).toBe(2); // capped
    // newest first (prepend), so "three" is on top
    expect(region.firstElementChild.textContent).toBe("three");
  });

  it("applies the type class", () => {
    const region = document.createElement("div");
    const t = S.createToaster(region, { ttl: 99999, timer: fakeTimer() });
    t.show("saved", "success");
    expect(region.firstElementChild.classList.contains("toast-success")).toBe(true);
  });

  it("removes a toast after its ttl elapses", () => {
    const region = document.createElement("div");
    const timer = fakeTimer();
    const t = S.createToaster(region, { ttl: 1000, timer });
    t.show("temporary");
    expect(region.children.length).toBe(1);
    timer.advance(1000);
    expect(region.children.length).toBe(0);
  });
});
