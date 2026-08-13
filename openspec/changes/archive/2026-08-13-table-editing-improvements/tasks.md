## 1. Header normalization & styling (CSS + Clean-time)

- [x] 1.1 Remove the `.wet-scope .table thead th` rule (light-grey background + bold) from the CSS block so it cannot conflict with the dark header.
- [x] 1.2 In `formatTableOnClean`, after ensuring a `<thead>` exists, always normalize every thead cell to `<th scope="col">` (closes the `if (!thead)` gap for Word-supplied theads).
- [x] 1.3 In `formatTableOnClean`, stamp `bg-dark` and `text-white` onto each thead `<tr>`.
- [x] 1.4 Verify a pasted table with a pre-existing thead of `<td>` cells produces `<th scope="col">` cells and a dark header row in both canvas and output.

## 2. Active toggle correctness

- [x] 2.1 Remove `font-weight: bold` from the `.wet-scope … tr.active` CSS rule (keep `bg-info` rule unchanged).
- [x] 2.2 In `action_toggleActive`, stop flipping the leading `<th>` scope to `colgroup`; keep `scope="row"` (do not change scope at all).
- [x] 2.3 In `action_toggleActive`, gate the `setBold`/`fnt-nrml` side effects so they run only when the resolved class is `bg-info`; for the `active` class the toggle is background-only.
- [x] 2.4 Verify toggling active on/off changes only the background; scope stays `row`, no `<strong>`/weight change.

## 3. Remove-`<p>` cell action

- [x] 3.1 Add a toolbar button (e.g. `removePBtn`) to the toolbar HTML in the appropriate button group.
- [x] 3.2 Implement `action_removeParagraphs`: for each selected cell, snapshot its `<p>` descendants and unwrap each; if a `<p>`'s `nextElementSibling` is also a `<p>`, insert a `<br>` before unwrapping so siblings join as `A<br>B`.
- [x] 3.3 Wire the button in `bindToolbar` and call `syncOutput()` after the action.
- [x] 3.4 Verify single `<p>`, multiple sibling `<p>` (→ `<br>` joined), and `<li><p>…</p></li>` cases all unwrap correctly.

## 4. Non-breaking-space cell action

- [x] 4.1 Add a toolbar button (e.g. `nbspBtn`) to the toolbar HTML.
- [x] 4.2 Implement `action_nbsp`: for each selected cell, walk text nodes via `NodeFilter.SHOW_TEXT` TreeWalker and replace U+0020 with U+00A0 in `nodeValue`.
- [x] 4.3 Wire the button in `bindToolbar` and call `syncOutput()` after the action.
- [x] 4.4 Verify output contains `&nbsp;` for cell text spaces while attribute values keep regular spaces.

## 5. Empty footer via "To foot"

- [x] 5.1 Refactor `action_moveToFooter` to always ensure `<tfoot>` scaffolding (the `<tr class="small">` with a colspan-`maxWidth` `<td>`) exists without duplicating when one already exists.
- [x] 5.2 When no cells are selected, create/reuse the empty footer and return without moving or removing any content.
- [x] 5.3 Preserve today's move-content behavior when cells are selected.
- [x] 5.4 Verify: empty footer created with no selection; no duplicate footer when one exists; selection still moves content.

## 6. Table-modifier class toggles

- [x] 6.1 Add three checkboxes (`table-condensed`, `table-striped`, `table-hover`) with stable ids to the toolbar HTML.
- [x] 6.2 Wire each checkbox in `bindToolbar` to toggle its class on the active `<table>` and call `syncOutput()`.
- [x] 6.3 In `showToolbar`, read the active table's `classList` and set each checkbox's `checked` state so controls resync when switching tables.
- [x] 6.4 Verify toggling each class on/off updates the `<table>` and output, and that activating a different table updates the checkboxes.

## 7. Image placeholders

- [x] 7.1 Add `.wet-scope .img-placeholder` CSS (dashed box, visible label) so placeholders render in the canvas.
- [x] 7.2 Modify `stripImages` to insert a `<figure class="img-placeholder" data-img-alt="…">[IMAGE: …]</figure>` at each image's position instead of deleting it; derive the label from `img.alt`, else the `src` filename, else the word `image`. Keep returning the count.
- [x] 7.3 In `serializeCanvas`, replace each `.img-placeholder` with an `<!-- image: … -->` comment node carrying the description; ensure no placeholder element survives into output.
- [x] 7.4 Reword the Stage-2 warning from "removed — handle separately" to reflect that images were replaced with placeholders.
- [x] 7.5 Verify: canvas shows a visible box; output contains the comment and no placeholder element; alt text and the no-alt fallback both serialize correctly.

## 8. Verification

- [ ] 8.1 Open `word-to-html.html` in a browser and paste a sample Word doc exercising tables and images; confirm all seven behaviors match the spec scenarios.
- [x] 8.2 Confirm existing flows still work (caption editing, presets, merge/delete, indent, align, copy HTML) with no regressions.
