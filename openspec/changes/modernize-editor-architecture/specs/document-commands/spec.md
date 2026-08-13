## Purpose

One-click transforms that rewrite the document model to add Canada.ca publishing structures: stable IDs on headings, tables, and figures; an On-this-page section; a table of contents; doc-wide non-breaking-space correction; footnotes converted to publishing markup; and one-click table cleanup.

## ADDED Requirements

### Requirement: Add stable IDs to headings

The editor SHALL provide a command that assigns stable, unique `id` attributes to every heading (`h1`–`h6`) in the document that does not already have one. Existing IDs SHALL be preserved.

#### Scenario: Headings without IDs receive one

- **WHEN** the document contains `<h2>Funding</h2>` and the command runs
- **THEN** the heading gains a unique `id` derived from its text, e.g. `<h2 id="funding">Funding</h2>`

#### Scenario: Headings that already have IDs are left alone

- **WHEN** the document contains `<h2 id="existing">Existing</h2>` and the command runs
- **THEN** the `id` remains `existing`

#### Scenario: Generated IDs are unique within the document

- **WHEN** two headings produce the same derived slug
- **THEN** each receives a distinct `id` with a numeric suffix

### Requirement: Add stable IDs to tables and figures

The command SHALL also assign stable, unique `id` attributes to every `<table>` and figure-like element in the document that does not already have one.

#### Scenario: Tables receive an ID

- **WHEN** the document contains a `<table>` without an `id`
- **THEN** after the command runs the table has a unique `id`

### Requirement: Optional On-this-page section generation

When the On-this-page option is enabled, the command SHALL insert an On-this-page navigation section whose links target the IDs of the document's headings, scoped to the selected heading depth.

#### Scenario: On-this-page links to headings

- **WHEN** the option is enabled with heading depth 2 and the document has `<h2>` headings
- **THEN** an On-this-page section is inserted containing anchor links to each `<h2>`'s `id`

#### Scenario: Heading depth limits included headings

- **WHEN** the option is enabled with heading depth 2 and the document also contains `<h3>` headings
- **THEN** the On-this-page section links to `<h2>` elements only and excludes `<h3>` elements

### Requirement: Optional Table-of-contents conversion

When the Table-of-contents option is enabled, the command SHALL convert the relevant heading structure into a Canada.ca Table-of-contents pattern instead of (or in addition to) the On-this-page section.

#### Scenario: Headings converted to ToC pattern

- **WHEN** the option is enabled and the command runs
- **THEN** the document contains the Table-of-contents markup rather than a plain On-this-page section

### Requirement: Doc-wide non-breaking-space validation

The editor SHALL provide a command that scans the document text and inserts non-breaking spaces (U+00A0) at the positions required by Canada.ca typography rules, operating across the whole document rather than only within table cells.

#### Scenario: Required nbsp inserted around the document

- **WHEN** the document body text contains a pattern requiring a non-breaking space (e.g. a number followed by a unit)
- **THEN** after the command runs the serialized HTML contains `&nbsp;` at that position

#### Scenario: Existing non-breaking spaces are not doubled

- **WHEN** the document already contains a non-breaking space at a required position
- **THEN** the command leaves it as a single non-breaking space

### Requirement: Footnotes converted to publishing markup

The editor SHALL provide a command that detects footnote-like structures carried over from Word and converts them into Canada.ca footnote publishing markup.

#### Scenario: Word footnote becomes publishing markup

- **WHEN** the document contains a Word-derived footnote structure
- **THEN** after the command runs the footnote is represented in Canada.ca publishing markup

### Requirement: One-click table cleanup command

The editor SHALL provide a table-cleanup command that converts a table in the document to Canada.ca (WET-BOEW) markup in a single non-interactive action, applying the same structural transformations that the interactive table editor applies.

#### Scenario: Raw table becomes WET markup

- **WHEN** the document contains a plain `<table>` and the command runs against it
- **THEN** the table is rewritten to Canada.ca/WET markup with appropriate header structure and classes
