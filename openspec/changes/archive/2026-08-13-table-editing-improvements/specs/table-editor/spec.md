## Purpose

Defines the behavior of Scribe's interactive table toolbar and the Clean-time table formatting pass: header-row structure and styling, the active-row toggle, cell-content transformations, footer creation, and table-modifier classes. The output must conform to Canada.ca (WET-BOEW) table conventions.

## ADDED Requirements

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
