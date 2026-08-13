## Context

Scribe is a single self-contained file (`word-to-html.html`) with a paste → sanitize → route → render pipeline and an interactive table toolbar. The relevant seams (see proposal.md for motivation):

- `formatTableOnClean` — the Clean-time table formatting pass that builds `thead`/`tbody` and assigns WET classes.
- `action_toggleActive`, `action_moveToFooter` — toolbar actions on the active table.
- `stripImages` (Stage 2 of the pipeline) and `serializeCanvas` (Stage 6, canvas → output HTML) — the two ends of image handling.
- `showToolbar` / `bindToolbar` — toolbar UI wiring; `serializeCanvas` already strips canvas-only artifacts (`.selected`, `.table-widget`, `.prose-block`), making it the natural seam for canvas↔output divergence.
- The `.wet-scope .table …` CSS block powers the preview.

All changes are confined to this one file; no build step, no new dependencies.

## Goals / Non-Goals

**Goals:**
- Make table output match WET-BOEW conventions (header cells/scoping, dark header, background-only active).
- Add the missing cell-content and table-class toolbar actions.
- Stop silently dropping images; leave recoverable markers.

**Non-Goals:**
- Altering the `bg-info` / "backgrounder" preset beyond what is required to keep it working (it stays background+bold as today).
- Actually importing/embedding image binaries — placeholders are markers only.
- Changing the sanitize/router/prose-cleaning stages unrelated to these seven issues.

## Decisions

### D1. Header normalization closes the pre-existing-thead gap
`formatTableOnClean` currently only converts cells when it *creates* a thead (`if (!thead)`). Decision: after ensuring a thead exists, **always** normalize every thead cell to `<th scope="col">` and stamp `bg-dark text-white` on each thead `<tr>`, regardless of whether the thead was created or supplied by Word. Remove the `thead th` preview CSS (light-grey background + bold) so it cannot fight `bg-dark text-white`.
- *Alternative:* make the dark header an opt-in toolbar toggle. Rejected — product wants it as the default WET header look.

### D2. Active toggle becomes background-only; backgrounder stays as-is
The `scope`→`colgroup` flip is wrong for non-spanning cells in **both** presets, so it is removed entirely; the leading `<th>` keeps `scope="row"`. The bold/`fnt-nrml` side effects in `action_toggleActive` are removed for the `active` class. To avoid scope creep on the unmentioned backgrounder preset, those bold side effects are **kept only when the active class is `bg-info`** (i.e. branch on the resolved class). The `.active` CSS rule loses `font-weight: bold`; the `.bg-info` rule is left unchanged.
- *Alternative:* unify both presets to background-only. Deferred — would change backgrounder behavior the user did not ask to change.

### D3. Remove-`<p>` joins siblings with `<br>`
Snapshot each selected cell's `<p>` descendants (array, for live-node safety) and unwrap each. If a `<p>`'s `nextElementSibling` is also a `<p>`, append a `<br>` to it before unwrapping, so consecutive sibling paragraphs become `A<br>B`. This rule is structural (siblings), so `<li><p>x</p></li>` correctly yields `<li>x</li>` with no `<br>`, and two `<li>`s each holding one `<p>` stay as two list items.
- *Alternative:* join with a space, or no separator. Rejected per user decision (visible separation preferred).

### D4. NBSP via text-node walking
A `NodeFilter.SHOW_TEXT` TreeWalker over each selected cell replaces ` ` (U+0020) with `\u00A0` in `nodeValue`. Walking text nodes inherently excludes attribute values, satisfying the "attributes unaffected" requirement without parsing.
- *Alternative:* regex on `innerHTML`. Rejected — risks corrupting attribute spacing.

### D5. Empty footer via "To foot" with no selection
Refactor `action_moveToFooter` to "ensure tfoot scaffolding exists" first (the row-spanning `<tr class="small"><td colspan=maxW>` it already builds), then move selected content if any. With no selection, the scaffolding is created and left empty; if a footer already exists, it is reused (no duplicate). This reuses existing code rather than adding a separate action.
- *Alternative:* a dedicated "Add footer" button. Rejected per user decision (reuse the existing button).

### D6. Table-modifier classes as state-reflecting checkboxes
Three checkboxes (`table-condensed`, `table-striped`, `table-hover`) in the toolbar. On change they toggle the class on the active `<table>` and call `syncOutput()`. `showToolbar` reads the active table's `classList` and sets each checkbox's `checked` state, so switching tables resyncs the controls (mirroring how caption inputs are populated today). WET/Bootstrap-3 class names are used (not Bootstrap-5 `table-sm`), matching the Canada.ca output target.

### D7. Image placeholders: visible box in canvas, comment in output
`stripImages` inserts a `<figure class="img-placeholder" data-img-alt="…">[IMAGE: …]</figure>` at each image's position (text content keeps it safe from `serializeCanvas`'s empty-element stripping). New `.wet-scope .img-placeholder` CSS renders a dashed box. `serializeCanvas` converts each `.img-placeholder` to a comment node `<!-- image: … -->` (preserving the description), exactly where it already strips other canvas-only nodes. Alt text comes from `img.alt`; falling back to the `src` filename, then to the bare word `image`. The Stage-2 warning is reworded from "removed" to "replaced with a placeholder".
- *Alternative:* emit the visible `<figure>` in output too. Rejected per user decision (output must stay clean for publishing).

## Risks / Trade-offs

- **[Visual breakage for existing users]** → The header look changes globally to dark/white. Acceptable and intended; documented as BREAKING in the proposal. No data impact (single-file app; revert = file rollback).
- **[Backgrounder bold divergence]** Keeping `bg-info` bold while `active` is not creates a subtle asymmetry. → Mitigated by branching explicitly on class and documenting it (D2); a future change can unify them.
- **[Placeholder stripped by cleanup]** `serializeCanvas`'s recursive empty-stripping could remove a placeholder if it had no text. → Mitigated by always giving the placeholder visible text content.
- **[NBSP inside existing entities]** Replacing spaces in text nodes will also turn the spaces inside already-present `&nbsp;` sequences? No — `&nbsp;` decodes to U+00A0 in the DOM text, not U+0020, so it is left untouched. No collision.
- **[Empty footer colspan drift]** If columns are added/merged after an empty footer is created, its `colspan` is not auto-updated. → Accepted; matches the existing footer behavior and is hand-editable in the output panel.

## Migration Plan

Single-file deployment: replace `word-to-html.html`. No persisted state, no server, no API. Rollback is restoring the prior file. No action required from end users beyond refreshing the page.
