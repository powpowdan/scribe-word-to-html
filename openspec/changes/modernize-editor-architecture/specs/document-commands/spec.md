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

### Requirement: On-this-page / in-page ToC generation (GCWeb gc-toc)

The command SHALL insert the official GCWeb in-page table-of-contents component — the "On this page" pattern — as `<nav class="gc-toc">` containing a heading (no trailing colon) and a nested list of anchor links targeting the document's heading IDs, scoped to the selected heading depth (h2 through h{depth}; h1 is the page title and excluded). The command SHALL support these options: **Numbered** (hierarchical `1.` / `1.1.` prefixes on the entry text only — the document's headings themselves are never numbered), **Bold H2s** (top-level entry anchors wrapped in `<strong>`), and **Collapsible** (a `<details><summary>` wrapper whose summary replaces the nav's heading). Regeneration SHALL be idempotent across variants: any previously generated block — plain nav, collapsible `<details>`, or the earlier `nav.on-this-page` markup — is replaced, never duplicated. The generated heading text SHALL follow the selected publishing language (English "On this page", French "Sur cette page").

#### Scenario: On-this-page links to headings

- **WHEN** the option is enabled with heading depth 2 and the document has `<h2>` headings
- **THEN** a `nav.gc-toc` is inserted containing anchor links to each `<h2>`'s `id`

#### Scenario: Heading depth limits included headings

- **WHEN** the option is enabled with heading depth 2 and the document also contains `<h3>` headings
- **THEN** the ToC links to `<h2>` elements only and excludes `<h3>` elements

#### Scenario: Numbered prefixes apply to entries only

- **WHEN** the Numbered option is enabled
- **THEN** ToC entry text carries hierarchical prefixes (`1. `, `1.1. `) and the document's headings are unchanged

#### Scenario: Collapsible variant

- **WHEN** the Collapsible option is enabled
- **THEN** the ToC is wrapped in `<details>` with a summary carrying the title text, and the inner nav carries no heading of its own

#### Scenario: Regeneration across variants leaves no duplicates

- **WHEN** a ToC was generated with the Collapsible option and is regenerated without it
- **THEN** exactly one `nav.gc-toc` remains and no `<details>` wrapper is left behind

#### Scenario: French title

- **WHEN** the publishing language is French and the ToC is generated
- **THEN** the ToC heading (or collapsible summary) reads "Sur cette page"

### Requirement: Doc-wide non-breaking-space validation

The editor SHALL provide a command that scans the document text and inserts non-breaking spaces (U+00A0) at the positions required by Canada.ca typography rules, operating across the whole document rather than only within table cells.

#### Scenario: Required nbsp inserted around the document

- **WHEN** the document body text contains a pattern requiring a non-breaking space (e.g. a number followed by a unit)
- **THEN** after the command runs the serialized HTML contains `&nbsp;` at that position

#### Scenario: Existing non-breaking spaces are not doubled

- **WHEN** the document already contains a non-breaking space at a required position
- **THEN** the command leaves it as a single non-breaking space

### Requirement: Footnotes added via manual insert (WET/GCWeb markup)

The editor SHALL provide an "Insert footnote" command that, at the user's caret in the document, prompts for the footnote text and inserts WET/GCWeb footnote markup: an in-body reference (`<sup id="fnN-rf"><a class="fn-lnk" href="#fnN">…</a></sup>`) at the caret, and a definition-list entry (`<dt>Footnote N</dt>` + `<dd id="fnN"><p>text</p><p class="fn-rtn">…return…</p></dd>`) appended to a footnotes section (`<aside class="wb-fnote" role="note"><h2 id="fn">Footnotes</h2><dl/></aside>`), creating that section if it is absent. The footnote number SHALL be one greater than the highest existing numeric footnote id (symbolic ids such as `fn*` SHALL be skipped). Word footnotes are not auto-extracted (the cleanup pipeline strips Word footnote markup as unreliable); authors add footnotes manually with this command.

#### Scenario: Inserting a footnote at the caret

- **WHEN** the user places the caret in the document and inserts a footnote with the text "Source: Statistics Canada."
- **THEN** a `<sup>` reference appears at the caret and a matching `<dd>` entry is added to the document's footnotes section

#### Scenario: The footnotes section is created on first insert

- **WHEN** the document has no footnotes section and the user inserts a footnote
- **THEN** an `<aside class="wb-fnote">` with a "Footnotes" heading and definition list is created and the entry is placed inside it

#### Scenario: Numbers continue from the highest existing footnote

- **WHEN** the document already contains footnotes 1 and 2 and the user inserts another
- **THEN** the new footnote is numbered 3

### Requirement: One-click table cleanup command

The editor SHALL provide a table-cleanup command that converts a table in the document to Canada.ca (WET-BOEW) markup in a single non-interactive action, applying the same structural transformations that the interactive table editor applies.

#### Scenario: Raw table becomes WET markup

- **WHEN** the document contains a plain `<table>` and the command runs against it
- **THEN** the table is rewritten to Canada.ca/WET markup with appropriate header structure and classes
