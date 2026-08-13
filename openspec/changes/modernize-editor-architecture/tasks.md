## 1. Foundation — dual-view editor and testing baseline

- [x] 1.1 Scaffold `editor/` directory: `index.html`, `css/`, `src/`, `tests/`; confirm it loads empty over `python3 -m http.server`
- [x] 1.2 Vendor Bootstrap 5, Font Awesome, and mammoth locally under `editor/`; wire them via relative paths only
- [x] 1.3 Add a strict Content-Security-Policy `meta` tag; verify zero runtime network requests with devtools
- [x] 1.4 Implement `src/document-model.js`: HTML source of truth with `getHTML()`, `setHTML()`, `subscribe()`, and change emit
- [x] 1.5 Implement `src/code-view.js`: textarea bound to the document model
- [x] 1.6 Implement `src/live-view.js`: contentEditable region bound to the document model
- [x] 1.7 Implement `src/sync.js`: refresh-on-blur wiring between Live and Code views; no caret mapping
- [x] 1.8 Capture vitest snapshot tests over legacy `sanitizeWordHtml` for representative Word inputs *before* moving it
- [x] 1.9 Extract `sanitizeWordHtml` (and the image-placeholder logic) verbatim from legacy into a reusable module
- [x] 1.10 Verify the extracted module's snapshots still match the pre-extraction baselines
- [x] 1.11 Wire paste entry: Word clipboard → cleanup pipeline → document model
- [x] 1.12 Wire `.docx` entry via mammoth → document model; surface a clear error if mammoth is unavailable
- [x] 1.13 Wire raw-HTML entry in the Code view (bypasses cleanup)
- [x] 1.14 Implement Copy HTML control that copies the current document model to the clipboard
- [x] 1.15 `file://` works (no server required) — classic scripts load via `file://`; ES modules were reversed precisely to restore double-click-to-open *(see design.md reversal note)*
- [x] 1.16 Acceptance: paste a Word document, render in Live and Code, refresh-on-blur sync works, copy clean HTML *(browser-verified by user; o:p unwrap, mammoth .docx, clipboard all confirmed in-browser)*

## 2. Table editor lift — preserves the `table-editor` capability

- [x] 2.1 Extract Scribe's existing table toolbar logic from the legacy IIFE into `src/table-editor.js`
- [x] 2.2 Bind the table module to the document model (snapshot a table fragment, apply edits back on commit)
- [x] 2.3 Preserve existing behaviors: header-row promotion and styling, active toggle, No-`<p>`, NBSP-in-cell, move-to-footer (with empty-footer-when-no-selection), table-modifier class toggles
- [x] 2.4 Carry over caption fields (Table #, Title, Unit)
- [x] 2.5 Regression-check every scenario in `openspec/specs/table-editor/spec.md` against the lifted module
- [x] 2.6 Decision point: retire `word-to-html.html` now, or defer until a later increment *(retired at Inc 2: archived to `legacy/word-to-html.html`; README updated)*

## 3. QA/Activity panel — `qa-panel` capability

- [ ] 3.1 Build panel scaffold with Log, Report, and Review sections plus a health-score badge on the main editor surface
- [ ] 3.2 Subscribe the activity log to document-model change events; render human-readable action entries
- [ ] 3.3 Implement the document outline builder from `h1`–`h6`; render nested; handle the no-headings placeholder
- [ ] 3.4 Implement tag/selector counting with save/recall presets
- [ ] 3.5 Implement an initial health-score algorithm (heading hierarchy, ID coverage, detected issues); refine later
- [ ] 3.6 Implement review-list issue detectors (skipped heading levels, tables without IDs, etc.)
- [ ] 3.7 Wire outline and review-item selection to navigate to the corresponding document location

## 4. Document commands — `document-commands` capability

- [ ] 4.1 Implement Add IDs for headings (`h1`–`h6`), tables, and figures; preserve existing IDs; guarantee uniqueness
- [ ] 4.2 Add On-this-page option with selectable heading depth
- [ ] 4.3 Add Table-of-contents conversion option
- [ ] 4.4 Implement doc-wide NBSP validation command (generalizes the in-cell version)
- [ ] 4.5 Implement footnotes → Canada.ca publishing markup command
- [ ] 4.6 Implement one-click table cleanup command (non-interactive; applies the same transforms as the editor)

## 5. Table editor enhancements — `table-editor` delta

- [x] 5.1 Add undo/redo history with discrete entries and disabled-state reflection on the controls
- [x] 5.2 Add delete-column action, colspan-aware
- [x] 5.3 Add a dedicated add-empty-footer-row action (distinct from move-to-footer)
- [x] 5.4 Add ID and caption suggestions derived from document context; optional one-tap accept
- [ ] 5.5 Add complex scoping mode: select parent header, associate/disassociate data cells, suspend ordinary editing while active *(DEFERRED — risky flagship; its own focused increment)*
- [x] 5.6 Add financial-table numeric right-alignment option *(delivered via the Financial preset dropdown in Inc 2; toggle-checkbox UX variant skipped as redundant)*
- [x] 5.7 Add French-number-format option (comma decimals, narrow-nbsp thousands separators) *(delivered via the French Numbers preset dropdown in Inc 2; toggle-checkbox UX variant skipped as redundant)*

## 6. Code-view power features — `code-view-power-features` capability

- [ ] 6.1 Add syntax highlighting that stays in sync with the editable textarea *(DEFERRED — fiddly overlay technique; line numbers + find/replace + go-to-line shipped without it)*
- [x] 6.2 Add line numbers that track content growth and shrinkage
- [x] 6.3 Add find with next/previous navigation and wrapping
- [x] 6.4 Add regex find mode with backreference support
- [x] 6.5 Add replace and replace-all
- [x] 6.6 Add go-to-line navigation with rejection of out-of-range line numbers

## 7. WYSIWYG formatting toolbar — `wysiwyg-formatting` capability

- [ ] 7.1 Add bold and italic toggles that reflect active state at the cursor
- [ ] 7.2 Add ordered and unordered list controls
- [ ] 7.3 Add indent and outdent controls
- [ ] 7.4 Add block-format selector (paragraph, h1–h6)
- [ ] 7.5 Add create-link control

## 8. Polish — recovery, toasts, onboarding

- [x] 8.1 Implement document recovery: debounced autosave to localStorage, restore prompt with restore/dismiss/discard choices, local-only privacy notice
- [x] 8.2 Implement a toast region for transient activity notifications
- [x] 8.3 Implement an onboarding empty state (upload / instructions / blank-start)

## 9. Bilingual EN/FR — `bilingual-output` capability

- [ ] 9.1 Add an EN/FR language switch with persistence across reloads
- [ ] 9.2 Localize command output text (On-this-page, ToC, footnotes, etc.) per the selected language
- [ ] 9.3 Confirm switching applies only to subsequently generated content, not retroactively

## 10. Closure

- [ ] 10.1 Verify new-editor parity against the legacy tool's full surface; confirm the retirement decision from task 2.6
- [ ] 10.2 Remove the `portable/` reference directory once migration is complete and no longer needed for comparison
