## Purpose

Foundation editor that holds the document as a single source of truth and projects it into synchronized Live (WYSIWYG) and Code (raw HTML) views, with entry paths for pasted Word content, uploaded .docx files, and raw HTML.

## ADDED Requirements

### Requirement: Document model is the single source of truth

The editor SHALL maintain exactly one representation of the document as an HTML string. Both the Live view and the Code view SHALL project from and write back to this single representation. There SHALL be no third "output" representation that can diverge from the edited document.

#### Scenario: Edits in either view update the shared document

- **WHEN** the user edits content in the Live view and then switches to the Code view
- **THEN** the Code view reflects the edited document, and vice versa

#### Scenario: No divergent output panel

- **WHEN** the document is changed in any view
- **THEN** there is no separate output surface that retains stale content from a prior state

### Requirement: Live view renders the document as editable WYSIWYG

The editor SHALL provide a Live view that renders the document as formatted, visual content in a contentEditable region. Structural and inline elements SHALL display as they would render in the target Canada.ca page.

#### Scenario: Headings and paragraphs render visually

- **WHEN** the document contains `<h2>` and `<p>` elements
- **THEN** the Live view shows the heading styled as a heading and the paragraph as flowing body text

#### Scenario: Tables render as formatted tables

- **WHEN** the document contains a `<table>`
- **THEN** the Live view renders it as a visible, formatted table indistinguishable from the target page rendering

### Requirement: Code view shows the editable HTML source

The editor SHALL provide a Code view that shows the document as editable HTML source text in a monospace textarea. The Code view SHALL accept user edits and write them back to the document.

#### Scenario: Code view reflects document HTML

- **WHEN** the document contains `<p>Hello</p>`
- **THEN** the Code view shows the text `<p>Hello</p>`

#### Scenario: User edits in Code view update the document

- **WHEN** the user types additional HTML into the Code view and the edit is committed
- **THEN** the document model is updated with the new HTML

### Requirement: Refresh-on-blur synchronization between views

When a view loses focus, its committed edits SHALL be written to the document model and the other view SHALL be refreshed from the updated model. Caret position SHALL NOT be mapped across views in the initial version.

#### Scenario: Live edit propagates to Code on blur

- **WHEN** the user edits the Live view and then focuses the Code view
- **THEN** the Code view is refreshed to show the HTML produced by the Live edit

#### Scenario: Code edit propagates to Live on blur

- **WHEN** the user edits the Code view and then focuses the Live view
- **THEN** the Live view is refreshed to render the edited HTML

#### Scenario: Caret position is not mapped across views

- **WHEN** the user switches from one view to the other
- **THEN** the destination view's caret is placed at a default position rather than at the location corresponding to the source caret

### Requirement: Paste entry from Word clipboard

The editor SHALL accept pasted Word content via the clipboard and run it through the cleanup pipeline before it becomes the document. The existing cleanup behavior, including the image-placeholder behavior governed by the `image-placeholders` capability, SHALL be preserved unchanged.

#### Scenario: Pasted Word fragment is cleaned

- **WHEN** the user pastes Word clipboard content containing Microsoft Office markup
- **THEN** the resulting document contains the cleaned HTML without the Office-specific markup

#### Scenario: Image placeholders still appear after paste

- **WHEN** the user pastes Word content containing an `<img>`
- **THEN** the image is replaced by a visible placeholder in the Live view and serialized as an `<!-- image: ... -->` comment in the Code view, unchanged from the prior behavior

### Requirement: .docx upload entry via mammoth

The editor SHALL accept an uploaded `.docx` file and convert it to HTML using mammoth. Paste SHALL be presented to the user as the primary, higher-fidelity entry path, with `.docx` as a secondary path.

#### Scenario: docx converts to semantic HTML

- **WHEN** the user uploads a `.docx` file
- **THEN** the document is populated with semantic HTML produced by mammoth

#### Scenario: docx library failure is reported

- **WHEN** the user uploads a `.docx` and the mammoth library is not available
- **THEN** the user is shown an explanatory message and no document is created

### Requirement: Raw HTML entry

The editor SHALL accept raw HTML pasted into the Code view as a starting document, bypassing the Word cleanup pipeline.

#### Scenario: Raw HTML becomes the document directly

- **WHEN** the user pastes `<p>existing</p>` into an empty Code view
- **THEN** that HTML becomes the document without any cleanup being applied

### Requirement: Copy HTML output

The editor SHALL provide a Copy HTML control that copies the current document model's HTML to the clipboard.

#### Scenario: Copy yields the current document

- **WHEN** the user has edited the document and clicks Copy HTML
- **THEN** the clipboard receives the exact HTML of the current document model

### Requirement: Strangler coexistence with the legacy editor

The new editor SHALL coexist with the legacy `word-to-html.html` file without modifying it, until the new editor reaches feature parity. Running the legacy file SHALL continue to work unchanged.

#### Scenario: Legacy file is unmodified during migration

- **WHEN** the new editor is under development in its own directory
- **THEN** `word-to-html.html` opens and operates exactly as before

### Requirement: Local asset bundling and strict CSP

The new editor SHALL load Bootstrap, Font Awesome, and mammoth from locally vendored files only, with no runtime CDN requests. The new editor SHALL be openable offline once the directory is present, served over http(s).

#### Scenario: No runtime CDN requests

- **WHEN** the new editor is loaded in a browser with the network disabled
- **THEN** all styles, icons, and the .docx conversion library load successfully from local files

#### Scenario: file:// protocol is unsupported

- **WHEN** the new editor is opened directly via the `file://` protocol
- **THEN** ES module loading fails and the user is informed (via documented requirement) that a static http server is required
