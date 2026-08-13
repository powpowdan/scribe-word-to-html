## ADDED Requirements

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
