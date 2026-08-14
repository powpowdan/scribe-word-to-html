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

The toolbar SHALL provide controls that increase or decrease the indentation of the current block or list item. Inside a list, indenting SHALL nest the list item (native list behavior). Outside a list, indenting SHALL NOT wrap the block in a `<blockquote>`; it SHALL step the block through the WET margin classes (`mrgn-lft-md` → `mrgn-lft-lg` → `mrgn-lft-xl`, capped), and outdenting SHALL step back down and remove the class at the bottom. A multi-block selection SHALL ladder every block it touches. When the caret is in a bare table cell (no prose block), the control SHALL direct the user to the table toolbar's indent instead of modifying the cell.

#### Scenario: Indent a list item

- **WHEN** the cursor is in a list item and the user activates indent
- **THEN** the list item becomes nested under the previous item

#### Scenario: Indent a paragraph uses the WET margin ladder, never a blockquote

- **WHEN** the cursor is in a `<p>` outside any list and the user activates indent three times
- **THEN** the paragraph successively carries `mrgn-lft-md`, then `mrgn-lft-lg`, then `mrgn-lft-xl`, and no `<blockquote>` is ever created

#### Scenario: Outdent past the lowest level removes the class

- **WHEN** a paragraph carries `mrgn-lft-md` and the user activates outdent
- **THEN** the class is removed and further outdent is a no-op

### Requirement: Non-breaking-space the current selection

The toolbar SHALL provide an action that replaces every regular space with a non-breaking space (U+00A0) inside the current selection only, preserving unselected text (including partial text nodes and text after the selection end). With no selection, it SHALL prompt the user to select text first.

#### Scenario: Selected phrase becomes non-breaking

- **WHEN** the user selects "FedDev Ontario" and activates the NBSP action
- **THEN** the selection's space becomes U+00A0 and surrounding text is unchanged

#### Scenario: No selection warns instead of converting

- **WHEN** the user activates the NBSP action with a collapsed caret
- **THEN** a warning is shown and no text is converted

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
