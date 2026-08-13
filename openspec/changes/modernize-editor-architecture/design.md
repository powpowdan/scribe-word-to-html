## Context

Scribe today is a single self-contained `word-to-html.html` (~2,200 lines) with no build step, no tests, and a one-way pipeline: paste → sanitize → canvas (prose read-only, tables editable) → output textarea. Bootstrap 5, Font Awesome, and docx-preview load from CDN. The `portable/` directory contains a second internal tool, Propel, that solves the same problem with a far richer editing model but ships only as a minified bundle with no source and no license file. See `proposal.md` for the motivation; this design covers how the modernization is realized without inheriting Propel's bundle.

## Goals / Non-Goals

**Goals:**
- Establish a document model as the single source of truth that every view and command attaches to, replacing the one-way canvas/output split.
- Provide a migration path that never breaks the working legacy editor until parity is reached.
- Keep the runtime free of CDN dependencies and offline-capable.
- Make the cleanup pipeline testable before it is moved, so behavior is provably preserved.

**Non-Goals:**
- Porting or vendoring any of Propel's code. All Propel-derived features are reimplemented.
- A visible WYSIWYG formatting toolbar in the foundation increment (shortcuts already work via contentEditable; buttons arrive in a later increment).
- Full bi-directional caret mapping between Live and Code views in the first version.
- Touching the `image-placeholders` capability's observable behavior; it is carried over unchanged.

## Decisions

### Decision: Classic scripts sharing a global namespace (no build, no server, works via file://)

Editor modules are classic `<script src>` files, each wrapped in an IIFE that attaches its API to a shared `window.Scribe` namespace, loaded in dependency order from `index.html` with `main.js` last. There is no bundler and **no server requirement** — the editor opens by double-clicking `editor/index.html` (classic scripts load under `file://`, unlike ES modules). This preserves the README's "no build step or server required — just open the file" promise, which is a core Scribe value (offline/air-gapped use, share-via-email).

Tests consume the classic scripts by eval'ing them into a happy-dom `Window` (`tests/_load.js`), since the files have no `export`s to `import`. This exercises the real classic-script loading path headlessly.

**Reversal note:** This change initially chose *ES modules with no bundler*, on the strength of cleaner `import`/`export` syntax. That was reversed during foundation implementation when it became clear ES modules are blocked by browsers under `file://`, which silently broke the double-click promise and introduced a Python/http-server dependency the user rejected. The code reorganized cleanly (each `export` → `S.X = …`, each `import` → a `S.X` reference resolved at call time); behavior and the 31 tests are unchanged.

**Alternatives considered:**
- ES modules with no bundler: cleaner syntax, but requires an http server (browsers block module loading under `file://`). Rejected for breaking the double-click promise.
- ES modules for dev + bundle to a single file on release: best of both worlds for end users (one self-contained `scribe.html`) but reintroduces a build step. Deferred; could be revisited later if single-file distribution becomes a goal.
- A real bundler (esbuild/Vite): best DX (HMR, minification), but adds a toolchain and contradicts the "just open the directory" ethos.

### Decision: Strangler migration

The new editor lives in its own `editor/` directory and shares nothing with the legacy `word-to-html.html` at first. The legacy file is left byte-for-byte untouched. A decision point at the end of the table-editor-lift increment (when the new editor reaches parity with the legacy tool's core loop plus tables) determines whether the legacy file is retired.

**Alternatives considered:**
- Big-bang rewrite of `word-to-html.html`: cleaner end state, but loses the safety net during a large, multi-increment change with no existing tests.

### Decision: Document model as the single source of truth

A `document-model` module holds the document as HTML and exposes `getHTML()`, `setHTML()`, and change-event subscription (`subscribe()`/`emit()`). The Live and Code views are both projections that read from and write to the model. Commands and the QA panel observe the model and operate on it directly, never on a view.

**Alternatives considered:**
- Keep a canvas/output split (status quo): incompatible with editable prose, the QA panel, and most Propel-derived features.

### Decision: Refresh-on-blur sync between views in v1

When a view loses focus, its committed edits are written to the document model and the other view is refreshed. Caret position is not mapped across views.

**Alternatives considered:**
- Full reciprocal caret mapping (as Propel has, via its `#codeReciprocalCaret` element): polished, but contentEditable caret math is a known quirk mine and costs weeks of edge-case work. Deferred; revisited after the QA panel increment using real usage to judge whether the friction justifies the cost.

### Decision: Locally vendored assets with strict CSP

Bootstrap 5, Font Awesome, and mammoth are committed under `editor/` and loaded via relative paths. No runtime CDN. A strict Content-Security-Policy is applied.

**Alternatives considered:**
- Keep CDN (status quo): simpler, but breaks offline use and CSP, and contradicts the bundle-locally decision made for this change.

This increases repo size (roughly 1 MB+ of vendored CSS/JS), judged acceptable for offline capability.

### Decision: Keep Bootstrap 5

The new editor uses Bootstrap 5 (locally vendored) plus Scribe's existing custom styling. Proprietary visual polish is layered on incrementally where it adds clear value.

**Alternatives considered:**
- Hand-rolled CSS with inline SVG sprites (as Propel does): smaller payload and tighter control, but multiplies the CSS work across every increment. Deferred indefinitely unless Bootstrap proves limiting.

### Decision: mammoth for .docx conversion

The `.docx` entry uses mammoth (semantic conversion), replacing docx-preview (visual rendering). Paste remains the documented primary, higher-fidelity path.

**Alternatives considered:**
- Keep docx-preview: visual fidelity to Word's rendering, but produces layout-oriented rather than semantic HTML, which is the wrong target for Canada.ca structured output.

### Decision: Lift, don't rebuild, the table editor

Scribe's existing table toolbar logic is extracted from the legacy IIFE into a module and bound to the document model. Propel-derived enhancements (scoping, financial, French, undo/redo, delete-column, add-empty-footer, suggestions) are layered on top in a later increment.

**Alternatives considered:**
- Rebuild the table editor from scratch matching Propel: discards working, specced behavior (`table-editor` spec) and the differentiators already captured there.

### Decision: vitest with snapshot tests, established before any extraction

vitest is introduced at the foundation increment with no build step required to run it. The first tests are snapshots over the existing `sanitizeWordHtml` output on representative Word inputs, captured *before* the function is moved, so any regression during extraction fails loudly.

**Alternatives considered:**
- Continue with no tests (status quo of both projects): unacceptable for a tool producing published government HTML.

### Decision: Reimplement from Propel, never copy

Propel ships as a minified `propel.bundle.js` with no source maps and no license file in the repo. Every Propel-derived capability is reimplemented from its observed behavior. None of Propel's code is copied.

**Alternatives considered:**
- Vendoring `propel.bundle.js`: fastest, but inherits an unmaintainable 9k-line black box and unresolved licensing.

## Risks / Trade-offs

- **contentEditable cross-browser quirks** → Live-view edits may serialize differently across Chrome/Firefox/Safari. Mitigation: snapshot tests over the cleanup pipeline; explicit acceptance of last-2-versions browser baseline.
- **Refresh-on-blur loses caret context** → switching views resets the caret to a default position, a friction point vs. Propel. Mitigation: revisit reciprocal caret mapping after the QA-panel increment; the spec explicitly allows this two-phase approach.
- **Large multi-increment change** → highest delivery risk is scope creep and incomplete increments. Mitigation: strangler approach means each increment ships something demonstrable; the legacy file remains a working fallback at every step.
- **mammoth differs from docx-preview** → the `.docx` path's output will change character (semantic vs. visual). Mitigation: paste remains the primary path; `.docx` is secondary, and the change is documented in the spec.
- **No existing tests, behavior must not regress during extraction** → moving `sanitizeWordHtml` and the image-placeholder logic could silently change output. Mitigation: snapshot tests captured before any move; the `image-placeholders` capability's scenarios are the regression contract.
- **Repo size grows with vendored assets** → roughly 1 MB+ added. Mitigation: accepted trade-off for offline/CSP goals; vendored files are clearly separated and can be re-fetched from upstream.
- **Module mechanism must not require a server** → resolved up front by choosing classic scripts (ES modules were reversed because they break `file://` loading). The editor opens by double-clicking `editor/index.html`. Tests load the classic scripts by eval'ing them into a happy-dom window, exercising the real load path.

## Migration Plan

The migration is sequenced as discrete increments; each is independently demonstrable and the legacy `word-to-html.html` remains a working fallback throughout.

1. **Foundation** — Create `editor/` scaffold; vendor Bootstrap, Font Awesome, mammoth; implement document model, Live view, Code view, refresh-on-blur sync; reuse `sanitizeWordHtml` verbatim; wire paste / `.docx` / raw-HTML entry and Copy HTML; introduce vitest with snapshots over the cleanup pipeline. *Acceptance: paste a Word document, see it render in Live and Code with working refresh-on-blur sync, copy clean HTML.*
2. **Table editor lift** — Extract the legacy table toolbar into a module bound to the document model. *Decision point: retire `word-to-html.html` now, or after a later increment.*
3. **QA/Activity panel** — Read-only observation: outline, tag counts, health score, activity log, review list.
4. **Document commands** — Add IDs (with On-this-page and ToC options), doc-wide NBSP, footnotes, table cleanup.
5. **Table editor enhancements** — Scoping, financial, French, undo/redo, delete-column, add-empty-footer, suggestions.
6. **Code-view power features** — Syntax highlighting, line numbers, find/replace with regex, go-to-line.
7. **WYSIWYG formatting toolbar** — Bold/italic/lists/indent/block-format/link controls in Live view.
8. **Polish** — Document recovery, toasts, onboarding empty state.
9. **Bilingual EN/FR** — Language switch governing command output text.

**Rollback:** At any increment, abandoning the new editor leaves the legacy `word-to-html.html` fully functional. The new `editor/` directory can be removed wholesale without affecting the legacy file.

> **Update (Increment 2):** Retirement was pulled forward to Increment 2 (ahead of full parity). `word-to-html.html` was archived to `legacy/word-to-html.html` rather than deleted, so the fallback remains one double-click away in the working tree. Recovery is trivial if a table bug surfaces when browser-testing resumes. Git history also retains the original path.

## Open Questions

- **Document model internal representation** — hold the document as an HTML string, a parsed DOM tree, or both with a canonical direction? The spec mandates single-source-of-truth behavior but not representation. Resolvable at foundation-increment implementation without changing the spec.
- **Health-score algorithm** — the exact weighting of heading hierarchy, ID coverage, and detected issues into the score is not specified. Deferrable; refine based on what the Review list actually surfaces.
- **QA panel placement** — sidebar (Propel-style), bottom drawer, or modal? Affects layout work but not behavior; resolvable when the panel is implemented.
- **Vendored-asset directory layout** — exact paths under `editor/` for Bootstrap/Font Awesome/mammoth. Trivial; resolvable at foundation-increment implementation.
