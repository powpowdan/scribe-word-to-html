## Purpose

Read-only observation of the document that reports editing activity, document structure, tag/selector counts, an overall health score, and items the author should review.

## ADDED Requirements

### Requirement: Activity log records editor actions

The panel SHALL display a chronological log of editor actions (imports, command runs, table edits, and similar), each with a human-readable description. The log SHALL update live as actions occur.

#### Scenario: Import is logged

- **WHEN** the user pastes a Word document and it is cleaned
- **THEN** a new log entry describing the import appears at the top of the log

#### Scenario: Command run is logged

- **WHEN** the user runs the Add IDs command
- **THEN** a new log entry describing the command and its outcome appears

### Requirement: Document outline lists headings in order

The panel SHALL display an outline of the document built from its headings (`h1`–`h6`), preserving nesting order. Selecting an outline entry SHALL navigate to the corresponding heading in the editor.

#### Scenario: Outline reflects document structure

- **WHEN** the document contains `<h2>` and `<h3>` elements
- **THEN** the outline lists them in document order with the `<h3>` entries shown nested under their parent `<h2>`

#### Scenario: Empty document shows a placeholder

- **WHEN** the document contains no headings
- **THEN** the outline area shows a message indicating no headings were found

### Requirement: Tag and selector counts report document composition

The panel SHALL let the user enter one or more tags or CSS selectors and report how many times each matches in the document. The panel SHALL support saving and recalling count presets.

#### Scenario: Counting a tag

- **WHEN** the user enters `table` and runs the count
- **THEN** the panel reports the number of `<table>` elements in the document

#### Scenario: Counting a selector

- **WHEN** the user enters `.alert` and runs the count
- **THEN** the panel reports the number of elements matching the `.alert` selector

#### Scenario: Presets can be saved and recalled

- **WHEN** the user saves the current set of entries as a preset and later recalls it
- **THEN** the entry area is repopulated with the saved set

### Requirement: Health score summarizes document quality

The panel SHALL compute and display a single health score reflecting the document's structural quality (for example, presence of heading hierarchy, presence of IDs on key elements, absence of known issues). The score SHALL be visible from the main editor surface without opening the panel.

#### Scenario: Score reflects a clean document

- **WHEN** the document has a coherent heading hierarchy, IDs on headings, and no detected issues
- **THEN** the health score reads as a high/good value

#### Scenario: Score reflects detected problems

- **WHEN** the document has skipped heading levels or headings without IDs
- **THEN** the health score reads lower than the clean case

#### Scenario: Score is visible without opening the panel

- **WHEN** the panel is closed
- **THEN** the current health score remains visible on the main editor surface

### Requirement: Items to review surface detected issues

The panel SHALL list specific items in the document that the author should review (for example, skipped heading levels, tables without IDs, missing non-breaking spaces). Each item SHALL be navigable to its location in the document.

#### Scenario: Skipped heading level is listed

- **WHEN** the document jumps from `<h2>` to `<h4>` with no `<h3>`
- **THEN** the review list contains an entry describing the skipped level

#### Scenario: Review item navigates to its location

- **WHEN** the user selects a review item
- **THEN** the editor scrolls to and focuses the corresponding location in the document
