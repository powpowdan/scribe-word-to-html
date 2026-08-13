## Why

Scribe's interactive table editor produces Canada.ca (WET-BOEW) HTML that must match real GCWeb rendering. Several behaviors diverge from WET conventions or are missing entirely: header rows render with the wrong styling, the "active" toggle corrupts cell scope and bolds text instead of just greying the row, cells can't be cleaned of stray `<p>` tags or non-breaking-spaced, empty footers can't be added, common WET table classes can't be toggled, and removed images leave no trace of where they belonged. These gaps force manual hand-editing of the output HTML and risk publishing non-compliant markup.

## What Changes

- **Header normalization:** every `<thead>` cell becomes `<th scope="col">` (including the Word-supplied thead case that is currently skipped), and each thead `<tr>` gets `bg-dark text-white`. The conflicting light-grey/bold `thead th` preview CSS is removed. **BREAKING** for visual preview: header rows change from grey/bold to dark/white.
- **Active toggle correctness:** toggling "active" on a row no longer flips the leading cell's `scope` to `colgroup` (it stays `row`) and no longer bolds cell content — it only applies the grey background, matching real WET `.active`.
- **Remove paragraphs action:** new toolbar action that unwraps all `<p>` tags inside selected cells (including `<p>` nested in `<li>`), joining former paragraphs with `<br>`.
- **Non-breaking-space action:** new toolbar action that replaces all regular spaces with `&nbsp;` inside the text of selected cells.
- **Empty footer:** the "To foot" action, when no cells are selected, creates an empty `<tfoot>` row spanning the table width; with a selection it keeps today's move-content behavior.
- **Table-modifier classes:** three toolbar checkboxes (`table-condensed`, `table-striped`, `table-hover`) that reflect and toggle each class on the active table.
- **Image placeholders:** the cleanup pipeline no longer silently deletes images; it leaves a visible placeholder box in the canvas and emits an `<!-- image: ... -->` comment in the output HTML so authors know where images belong.

## Capabilities

### New Capabilities
- `table-editor`: interactive table toolbar and Clean-time table formatting — header normalization, active-toggle correctness, cell-content actions (remove `<p>`, non-breaking spaces), empty footer, and table-modifier class toggles.
- `image-placeholders`: placeholder markers left in place of removed images during the cleanup pipeline, visible in the canvas and serialized as comments in output.

### Modified Capabilities
<!-- None — no prior specs exist. -->

## Impact

- **Affected code:** single file `word-to-html.html` — CSS block (`.wet-scope .table` rules), `formatTableOnClean`, `action_toggleActive`, `action_moveToFooter`, `stripImages`, `serializeCanvas`, `showToolbar`, toolbar HTML, and `bindToolbar`.
- **New toolbar controls:** buttons for remove-`<p>` and NBSP; checkboxes for the three table-modifier classes; extended "To foot" semantics.
- **New canvas-only element:** `.img-placeholder` box requires preview CSS and a serialize-time conversion to an HTML comment.
- **No external dependencies:** Bootstrap/Font Awesome CDNs unchanged; no build step.
- **Output HTML contract:** header rows now carry `bg-dark text-white`; `scope` attributes on active rows are preserved; image removal sites gain comment markers. Existing hand-edited output remains valid.
