## Why

Scribe is a single self-contained HTML file that converts Word content into clean Canada.ca HTML. Its editor model is one-way and limiting: prose is read-only ("fix typos in Word and re-paste"), tables are the only editable structure, there is no live HTML view, no feedback on document quality, and no recovery if the browser closes. A parallel internal tool (Propel, currently in `portable/`) solves the same problem with a far richer editing model — a synchronized Live/Code dual-view editor, document-level enhancement commands, a QA/activity panel, and a much more capable table editor. This change modernizes Scribe's architecture and reimplements Propel's most valuable capabilities in Scribe's own style, so Scribe becomes the better tool without inheriting Propel's minified bundle or its unverified licensing.

## What Changes

- **New modular architecture** under `editor/` using ES modules and no bundler (dev via a static http server). The legacy `word-to-html.html` is preserved untouched (strangler approach) until the new editor reaches feature parity; retirement is a separate later decision.
- **Document model** as a single source of truth with change events, replacing Scribe's one-way paste → canvas → output pipeline.
- **Dual-view editor**: Live (contentEditable WYSIWYG) and Code (textarea) views with refresh-on-blur synchronization (full reciprocal caret mapping is deferred to a post-QA-panel review).
- **Editable tables in the new editor** by lifting Scribe's existing table toolbar into a module bound to the document model — behavior preserved, not rebuilt.
- **Table editor enhancements** reimplemented from Propel: complex scoping mode, financial numeric right-alignment, French number format, undo/redo history, delete-column, add-empty-footer, and ID/caption suggestions.
- **Document commands**: Add IDs (with On-this-page and Table-of-contents options), doc-wide NBSP validation, footnotes → Canada.ca markup, and one-click table cleanup.
- **QA/Activity panel**: document outline, tag counts, health score, activity log, and issues-to-review.
- **Code-view power features**: syntax highlighting, line numbers, find/replace with regex, and go-to-line — layered on the Code view.
- **WYSIWYG formatting toolbar**: bold/italic/lists/indent/block-format/link buttons in Live view (keyboard shortcuts already work via contentEditable in the foundation increment; this adds visible controls).
- **Document recovery**: localStorage autosave with a restore prompt on next load.
- **Bilingual EN/FR**: language switch governing command output text.
- **Vendored assets**: Bootstrap 5, Font Awesome, and mammoth bundled locally (no CDN), enabling strict CSP and offline use. **BREAKING** for the new editor's hosting model: it must be served over http(s), not opened via `file://` (ES modules require it).
- **Testing baseline**: vitest with snapshot tests on the conversion/cleanup pipeline (Scribe currently has no tests).
- **mammoth** replaces docx-preview as the .docx conversion library (semantic conversion; paste remains the primary, higher-fidelity path).
- Scribe's existing differentiators — user-configurable Smart Replacements and Advanced attribute/tag stripping — are carried into the new editor unchanged.

## Capabilities

### New Capabilities
- `dual-view-editor`: Document model (single source of truth plus change events), Live (contentEditable) and Code (textarea) views, refresh-on-blur sync, paste / .docx (mammoth) / raw-HTML entry, and Copy HTML. Foundation that every other capability attaches to.
- `document-commands`: One-click transforms operating on the document model — Add IDs (with On-this-page and Table-of-contents options), doc-wide NBSP validation, footnotes → Canada.ca publishing markup, and table cleanup.
- `qa-panel`: Read-only observation of the document — activity log, document report (outline and tag counts), issues-to-review, and a health score.
- `code-view-power-features`: Syntax highlighting, line numbers, find/replace with regex toggle, and go-to-line — layered on the Code view.
- `wysiwyg-formatting`: Visible Live-view toolbar — bold/italic/lists/indent/block-format select/create-link.
- `document-recovery`: localStorage autosave of the working document, with a restore prompt on next load.
- `bilingual-output`: EN/FR language switch governing command output text.

### Modified Capabilities
- `table-editor`: Lifted into the new architecture (preserving all existing requirements as a refactor) and extended with new requirements for complex scoping mode, financial numeric right-alignment, French number format, undo/redo history, delete-column, an add-empty-footer action, and ID/caption suggestions.

## Impact

- **New code**: `editor/` directory tree (`index.html`, `css/`, `src/` ES modules, `tests/`). No bundler; loaded via `<script type="module">`.
- **Existing code preserved**: `word-to-html.html` is untouched until parity is reached. `sanitizeWordHtml` and the image-placeholder behavior (per the `image-placeholders` spec) are extracted verbatim and reused; their observable behavior is unchanged, so `image-placeholders` receives no spec delta.
- **Dependencies added (vendored locally)**: Bootstrap 5, Font Awesome, mammoth. No CDN at runtime in the new editor.
- **Dependencies removed (in the new editor)**: docx-preview (replaced by mammoth).
- **Dev workflow**: requires a static http server (e.g. `python3 -m http.server`) for ES module loading; `file://` no longer works for the new editor.
- **Testing**: introduces vitest; no prior test infrastructure exists.
- **Reference code**: `portable/` remains as reference only; none of its code is copied (reimplementation, per the license-safe decision). It is removed once the migration completes.
- **Browser baseline**: last 2 versions of Chrome, Edge, Firefox, and Safari.
