# table-editor Specification

## Purpose

Defines the behavior of Scribe's interactive table toolbar and the Clean-time table formatting pass: header-row structure and styling, the active-row toggle, cell-content transformations, footer creation, and table-modifier classes. The output must conform to Canada.ca (WET-BOEW) table conventions.

## Requirements

### Requirement: Header rows use column-header cells

When a table is formatted, every cell inside a `<thead>` SHALL be a `<th>` element with `scope="col"`. This applies both when the header row is promoted from the first body row and when the source document already supplied a `<thead>` containing `<td>` cells.

#### Scenario: Word supplies a thead with td cells
- **WHEN** a pasted table already contains a `<thead>` whose cells are `<td>`
- **THEN** after formatting each thead cell is renamed to `<th scope="col">`

#### Scenario: Header promoted from first body row
- **WHEN** a pasted table has no `<thead>` and the first body row is promoted to the header
- **THEN** every cell in that promoted row is a `<th scope="col">`

### Requirement: Header rows carry dark styling

Each `<tr>` inside a `<thead>` SHALL carry the `bg-dark` and `text-white` classes. The canvas preview SHALL render header rows with this dark background and white text, and SHALL NOT apply a separate light-grey background or force bold weight on thead cells.

#### Scenario: Header styling applied on Clean
- **WHEN** a table is formatted during Clean
- **THEN** the thead `<tr>` elements have class `bg-dark text-white` and the preview shows a dark header with white text

### Requirement: Active toggle applies background only

Toggling a row "active" SHALL only add the row-level active class that produces a grey background. It SHALL NOT change any cell's `scope` attribute, SHALL NOT set `scope="colgroup"`, and SHALL NOT bold or unbold cell contents.

#### Scenario: Active applied to a body row
- **WHEN** the user toggles active on a selected body row whose leading cell is `<th scope="row">`
- **THEN** the row gains the grey-background class and the leading cell's `scope` remains `row`, and no bold/normal-weight class or `<strong>` is added to the row's cells

#### Scenario: Active removed from a body row
- **WHEN** the user toggles active off a previously active row
- **THEN** the grey-background class is removed and cell content weight and `scope` are left unchanged from their non-active state

### Requirement: Remove paragraphs from selected cells

The editor SHALL provide an action that, for every selected cell, unwraps all `<p>` elements so their content becomes direct cell content. This SHALL also unwrap `<p>` elements nested inside list items (`<li>`) within the cell. Where removing a `<p>` boundary would join two paragraphs, the two SHALL be separated by a `<br>`.

#### Scenario: Cell contains a single paragraph
- **WHEN** the action runs on a selected cell containing `<p>Hello</p>`
- **THEN** the cell content becomes `Hello` with no `<p>` wrapper

#### Scenario: Cell contains multiple paragraphs
- **WHEN** the action runs on a selected cell containing `<p>A</p><p>B</p>`
- **THEN** the cell content becomes `A<br>B`

#### Scenario: Paragraph nested in a list item
- **WHEN** the action runs on a selected cell containing `<ul><li><p>item</p></li></ul>`
- **THEN** the list item content becomes `<ul><li>item</li></ul>`

### Requirement: Non-breaking-space selected cells

The editor SHALL provide an action that replaces every regular space (U+0020) with a non-breaking space (U+00A0) inside the text content of each selected cell. The replacement SHALL apply only to text nodes, not to attribute values.

#### Scenario: Cell text spaces become non-breaking
- **WHEN** the action runs on a selected cell whose visible text is `FedDev Ontario`
- **THEN** the regular space is replaced and the serialized output contains `FedDev&nbsp;Ontario`

#### Scenario: Attributes are not affected
- **WHEN** the action runs on a selected cell whose element attributes contain spaces
- **THEN** the spaces inside attribute values remain regular spaces

### Requirement: Empty footer creation

The "move to footer" action SHALL create an empty `<tfoot>` when invoked with no cells selected. The empty footer SHALL consist of a single `<tr class="small">` containing one `<td>` whose `colspan` equals the table's greatest row width, ready to receive content. With cells selected, the action SHALL keep its existing behavior of moving the selected cells' content into the footer.

#### Scenario: Empty footer added with no selection
- **WHEN** the user triggers the footer action with no cells selected and the table has no `<tfoot>`
- **THEN** a `<tfoot>` is created with one spanning `<td>` and no content is moved or removed

#### Scenario: Empty footer added when a footer already exists
- **WHEN** the user triggers the footer action with no selection and a `<tfoot>` already exists
- **THEN** no duplicate footer is created and existing footer content is preserved

#### Scenario: Selection still moves content
- **WHEN** the user triggers the footer action with one or more cells selected
- **THEN** the selected content is moved into the footer as in the prior behavior

### Requirement: Table-modifier class toggles

The editor SHALL expose three independent controls that each toggle a WET table-modifier class on the active table: `table-condensed`, `table-striped`, and `table-hover`. Each control SHALL reflect the current state of its class on the active table, and activating a table SHALL sync the controls to that table's classes.

#### Scenario: Toggling a class on
- **WHEN** the user enables the `table-striped` control for the active table
- **THEN** the `<table>` gains the `table-striped` class and the output HTML reflects it

#### Scenario: Toggling a class off
- **WHEN** the user disables the `table-hover` control while the table has that class
- **THEN** the `table-hover` class is removed from the `<table>`

#### Scenario: Controls reflect the active table on activation
- **WHEN** the user activates a different table whose classes include `table-condensed` but not the others
- **THEN** only the `table-condensed` control is checked

### Requirement: Automatic complex-table accessibility associations (id/headers)

For complex tables — those with more than one header row, or any merged header cell (`colspan` or `rowspan` greater than 1) — the editor SHALL generate W3C H43 accessibility associations automatically: a unique `id` on every header cell (`<th>`) that lacks one, and a `headers` attribute on every data cell (`<td>`) listing the space-separated `id`s of every header cell that governs it (the column-header stack from each header row, plus the row-header cells in the data cell's own row, accounting for spanning). Simple tables SHALL be left scope-only (no `id`/`headers` noise). Existing human-set `id`s SHALL be preserved.

#### Scenario: Simple table is left scope-only

- **WHEN** content with a simple table (one header row, no merged header cells) is pasted and formatted
- **THEN** the table keeps `scope` attributes but receives no `id` on its headers and no `headers` attribute on its data cells

#### Scenario: Complex table gets id/headers automatically on paste

- **WHEN** content with a complex table (merged header cells, or multiple header rows) is pasted and formatted
- **THEN** every header cell has a unique `id` and every data cell has a `headers` attribute referencing every header cell that governs it

#### Scenario: A data cell under a spanning parent and a child header references both

- **WHEN** a data cell sits in a column governed by a spanning parent header and a child header beneath it, in a row with a row header
- **THEN** the data cell's `headers` attribute lists the parent header id, the child header id, and the row header id

#### Scenario: Existing human-set ids are preserved

- **WHEN** a header cell already has an `id` when associations are generated
- **THEN** that `id` is kept, and data-cell `headers` attributes reference it

#### Scenario: Regeneration is available on demand

- **WHEN** the user triggers the on-demand association command on the active table
- **THEN** `id` and `headers` associations are (re)generated for that table from its current structure

### Requirement: Financial table numeric right-alignment

The table editor SHALL provide a financial-table option that, when enabled, right-aligns the contents of numeric column headings and numeric data cells in the active table.

#### Scenario: Numeric data cells are right-aligned

- **WHEN** the financial option is enabled for a table whose data cells contain numeric values
- **THEN** those numeric data cells become right-aligned in the table markup

#### Scenario: Non-numeric cells are not affected

- **WHEN** the financial option is enabled for a table that also contains non-numeric text cells
- **THEN** the non-numeric cells retain their prior alignment

### Requirement: French number format option

The table editor SHALL provide a French-number-format option that, when enabled, reformats numeric values in the active table so that decimals use a comma and digit groups are separated by a narrow non-breaking space, matching Canadian French typographic conventions.

#### Scenario: Decimal point becomes a comma

- **WHEN** the French option is enabled for a table whose data cell contains `3.14`
- **THEN** the value is reformatted to `3,14`

#### Scenario: Thousands separator becomes a narrow non-breaking space

- **WHEN** the French option is enabled for a table whose data cell contains `1,000,000`
- **THEN** the value is reformatted to use narrow non-breaking spaces between digit groups

### Requirement: Undo and redo history for table edits

The table editor SHALL maintain an edit history and SHALL provide undo and redo controls. Each structural and content change to the table SHALL be recorded as a discrete history entry. The undo and redo controls SHALL reflect whether an action is available in each direction.

#### Scenario: Undo reverts the most recent table edit

- **WHEN** the user performs a merge and then activates undo
- **THEN** the merge is reversed and the table returns to its prior state

#### Scenario: Redo re-applies an undone edit

- **WHEN** the user activates undo and then activates redo
- **THEN** the undone edit is re-applied

#### Scenario: Controls reflect history availability

- **WHEN** there is no prior edit to undo
- **THEN** the undo control is shown disabled, and likewise for redo when there is nothing to redo

### Requirement: Delete selected columns

The table editor SHALL provide a delete-column action that removes the columns containing the selected cells from the active table, correctly accounting for cells that span multiple columns.

#### Scenario: Delete a single column

- **WHEN** one cell is selected and the user activates delete column
- **THEN** the entire column containing that cell is removed from the table

#### Scenario: Delete with a colspan cell in the selection

- **WHEN** the selection includes a cell that spans multiple columns and the user activates delete column
- **THEN** the deletion correctly adjusts the spanning cell's colspan rather than removing unrelated columns

### Requirement: Dedicated add-empty-footer-row action

The table editor SHALL provide a dedicated action that always creates an empty footer row, regardless of the current selection. This is distinct from the existing move-to-footer action, which only creates an empty footer when no cells are selected.

#### Scenario: Empty footer row added with a selection present

- **WHEN** cells are selected and the user activates the add-empty-footer-row action
- **THEN** an empty footer row is created and the selected content is not moved into it

#### Scenario: Empty footer row added without a footer present

- **WHEN** the table has no `<tfoot>` and the user activates the add-empty-footer-row action
- **THEN** a `<tfoot>` containing one spanning empty row is created

### Requirement: Suggested table IDs and captions

When the user opens the table editor for a table whose ID or caption fields are empty, the editor SHALL offer suggested values derived from the document context (for example, the table's sequential position and the text of nearby headings). The user MAY accept a suggestion with a single action or ignore it and type their own value.

#### Scenario: Suggested table ID offered

- **WHEN** the table editor opens for a table without an `id` and the document contains multiple tables
- **THEN** a suggested ID based on the table's position is offered alongside the ID field

#### Scenario: Suggested caption offered

- **WHEN** the table editor opens for a table without a caption and a nearby heading provides usable context
- **THEN** a suggested caption derived from that context is offered alongside the caption field

#### Scenario: Suggestion is optional

- **WHEN** a suggestion is offered and the user ignores it and types their own value
- **THEN** the user's value is used and the suggestion is not applied
