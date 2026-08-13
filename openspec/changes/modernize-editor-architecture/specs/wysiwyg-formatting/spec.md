## Purpose

A visible formatting toolbar in the Live view that applies inline and block formatting to the editable document, complementing the keyboard shortcuts that contentEditable provides natively.

## ADDED Requirements

### Requirement: Bold and italic toggle controls

The toolbar SHALL provide bold and italic toggle controls that apply or remove bold/italic formatting at the current selection in the Live view. Each control SHALL reflect whether the current selection is already bold or italic.

#### Scenario: Bold applied to a selection

- **WHEN** the user selects text in the Live view and activates the bold control
- **THEN** the selected text becomes bold in the document

#### Scenario: Bold control reflects active state

- **WHEN** the cursor is inside text that is already bold
- **THEN** the bold control is shown in its active/pressed state

### Requirement: List controls for ordered and unordered lists

The toolbar SHALL provide controls that turn the current block or selection into an ordered (`<ol>`) or unordered (`<ul>`) list, and remove list formatting when activated again on a list.

#### Scenario: Convert a paragraph to a bulleted list

- **WHEN** the cursor is in a `<p>` and the user activates the unordered-list control
- **THEN** the paragraph becomes a `<ul>` containing one `<li>` with the original text

### Requirement: Indent and outdent controls

The toolbar SHALL provide controls that increase or decrease the indentation of the current block or list item.

#### Scenario: Indent a list item

- **WHEN** the cursor is in a list item and the user activates indent
- **THEN** the list item becomes nested under the previous item

### Requirement: Block format selector

The toolbar SHALL provide a selector that changes the block element type of the current block (paragraph, h1–h6) to the chosen type.

#### Scenario: Change a paragraph to a heading

- **WHEN** the cursor is in a `<p>` and the user chooses Heading 2 from the selector
- **THEN** the block becomes an `<h2>`

### Requirement: Create link control

The toolbar SHALL provide a control that wraps the current selection in an anchor (`<a>`) element using a URL supplied by the user.

#### Scenario: Link created from a selection

- **WHEN** the user selects text, activates the create-link control, and supplies a URL
- **THEN** the selected text becomes a link to the supplied URL
