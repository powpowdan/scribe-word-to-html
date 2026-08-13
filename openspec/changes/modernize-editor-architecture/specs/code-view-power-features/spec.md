## Purpose

Power-user editing affordances layered on the Code view: syntax-highlighted rendering, line numbers, find and find-and-replace with optional regular-expression mode, and go-to-line navigation.

## ADDED Requirements

### Requirement: Code view is syntax highlighted

The Code view SHALL render the HTML source with syntax highlighting (distinct visual treatment of tags, attributes, attribute values, and text) while the underlying editable text remains the plain HTML source. The highlighted rendering SHALL stay in sync with the editable text as it changes.

#### Scenario: Tags and attributes are visually distinct

- **WHEN** the Code view displays `<a href="x">link</a>`
- **THEN** the tag name, the attribute name, and the attribute value each appear in visually distinct styling

#### Scenario: Highlight follows edits

- **WHEN** the user edits the HTML in the Code view
- **THEN** the highlighting re-renders to reflect the edited content

### Requirement: Code view shows line numbers

The Code view SHALL display line numbers aligned to the lines of HTML source, and the line numbers SHALL update as the source grows or shrinks.

#### Scenario: Line numbers track content

- **WHEN** the HTML source contains five lines
- **THEN** the line-number gutter shows numbers 1 through 5 aligned with those lines

### Requirement: Find matches within the Code view

The Code view SHALL provide a find control that highlights all matches of the entered term in the source and lets the user step to the next and previous match.

#### Scenario: Find highlights matches

- **WHEN** the user enters a term that occurs three times in the source
- **THEN** all three occurrences are highlighted and the current match is distinguished

#### Scenario: Next and previous navigation

- **WHEN** the user steps to the next match and then to the previous match
- **THEN** the current-match indicator moves accordingly and wraps at the ends

### Requirement: Optional regular-expression find and replace

The find control SHALL support a regular-expression mode. When enabled, the find term SHALL be interpreted as a JavaScript regular expression, and the replace control SHALL support backreferences.

#### Scenario: Regex find matches a pattern

- **WHEN** the user enables regex mode and enters `h[1-3]`
- **THEN** every `h1`, `h2`, and `h3` occurrence is highlighted as a match

#### Scenario: Regex replace with backreference

- **WHEN** the user finds `<h(\d)>` and replaces with `<h$1 class="x">` in regex mode
- **THEN** each matched heading tag gains the class while preserving its level number

### Requirement: Find and replace, including replace-all

The Code view SHALL provide a replace control that replaces the current match or all matches with the replacement term.

#### Scenario: Replace updates the current match

- **WHEN** the user replaces the current match
- **THEN** the document is updated at that position and the next match becomes current

#### Scenario: Replace all updates every match

- **WHEN** the user chooses replace all
- **THEN** every match in the document is replaced and the document reflects the cumulative change

### Requirement: Go-to-line navigation

The Code view SHALL provide a go-to-line control that moves the cursor and scroll position to the start of the requested line number.

#### Scenario: Go to an existing line

- **WHEN** the source has at least ten lines and the user goes to line 8
- **THEN** the cursor is placed at the start of line 8 and that line is scrolled into view

#### Scenario: Go to a non-existent line is rejected

- **WHEN** the user goes to a line number greater than the number of lines in the source
- **THEN** no navigation occurs and the user is informed that the line does not exist
