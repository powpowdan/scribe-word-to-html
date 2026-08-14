## Purpose

Read-only observation of the document that reports its structure (a navigable heading outline), tag/selector counts, and a pre-publish list of items the author should review. (The activity log and health-score badge from the original proposal were descoped.)

## ADDED Requirements

### Requirement: Document outline lists headings in order

The panel SHALL display an outline of the document built from its real headings (`h1`–`h6`), preserving nesting order. Headings that belong to a generated "On this page" nav SHALL be excluded. Selecting an outline entry whose heading has an id SHALL navigate to that heading in the editor.

#### Scenario: Outline reflects document structure

- **WHEN** the document contains `<h2>` and `<h3>` elements
- **THEN** the outline lists them in document order with the `<h3>` entries shown nested under their parent `<h2>`

#### Scenario: Empty document shows a placeholder

- **WHEN** the document contains no headings
- **THEN** the outline area shows a message indicating no headings were found

#### Scenario: Generated "On this page" heading is excluded

- **WHEN** the document contains a `nav.on-this-page` with its own `<h2>On this page</h2>`
- **THEN** that heading does not appear in the outline

### Requirement: Tag and selector counts report document composition

The panel SHALL let the user enter one or more tags or CSS selectors (one per line) and report how many times each matches in the document. Invalid selectors SHALL be reported as invalid rather than crashing the count. The panel SHALL support saving and recalling count presets (persisted to browser local storage).

#### Scenario: Counting a tag

- **WHEN** the user enters `table` and runs the count
- **THEN** the panel reports the number of `<table>` elements in the document

#### Scenario: Counting a selector

- **WHEN** the user enters `.alert` and runs the count
- **THEN** the panel reports the number of elements matching the `.alert` selector

#### Scenario: Invalid selector is reported, not thrown

- **WHEN** the user enters a syntactically invalid selector
- **THEN** the count for that line reports an error indicator and the other lines still count normally

#### Scenario: Presets can be saved and recalled

- **WHEN** the user saves the current set of entries as a named preset and later recalls it
- **THEN** the entry area is repopulated with the saved set

### Requirement: Items to review surface detected pre-publish issues

The panel SHALL list specific items in the document that the author should review before publishing, drawn from at least: skipped heading levels, headings without an id, tables without an id, leftover image placeholders, empty headings, and links with an empty or placeholder href. Each item that has a target id SHALL be navigable to its location in the document.

#### Scenario: Skipped heading level is listed

- **WHEN** the document jumps from `<h2>` to `<h4>` with no `<h3>`
- **THEN** the review list contains an entry describing the skipped level

#### Scenario: Heading without an id is listed

- **WHEN** the document contains a heading with no `id`
- **THEN** the review list contains an entry flagging it

#### Scenario: Leftover image placeholder is listed

- **WHEN** the document still contains an `img-placeholder` figure
- **THEN** the review list contains an entry reminding the author to handle the image

#### Scenario: Clean document reports no issues

- **WHEN** the document has a coherent heading hierarchy, ids on headings, and none of the flagged conditions
- **THEN** the review list shows that no issues were found

#### Scenario: Named anchor without href is not a link issue

- **WHEN** the document contains an anchor with a `name` attribute and no `href` (a bookmark)
- **THEN** it is not listed as a bad-link issue

#### Scenario: Review item navigates to its location

- **WHEN** the user selects a review item that has a target id
- **THEN** the editor scrolls the corresponding element into view
