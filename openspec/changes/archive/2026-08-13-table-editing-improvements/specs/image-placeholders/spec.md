## Purpose

Defines how Scribe's cleanup pipeline marks the location of images that are stripped from pasted Word content, so authors can identify where images belong without the images being silently lost.

## ADDED Requirements

### Requirement: Removed images leave a placeholder marker

When the cleanup pipeline removes an `<img>` element, it SHALL leave a placeholder marker at the image's original position rather than deleting it without trace. The placeholder SHALL be visible in the canvas preview and SHALL identify the image.

#### Scenario: Image is replaced by a visible canvas placeholder
- **WHEN** pasted content containing an `<img>` is cleaned
- **THEN** the canvas displays a visible placeholder box at the image's former position

#### Scenario: Image without alt text
- **WHEN** a removed image has no `alt` attribute
- **THEN** the placeholder is still shown and identified generically as an image

### Requirement: Placeholders serialize as comments in output

When the canvas is serialized to the output HTML, every image placeholder SHALL be converted to an HTML comment marker. The output HTML SHALL NOT contain the canvas-only placeholder element, and the comment SHALL preserve any available image description.

#### Scenario: Output contains a comment, not a placeholder element
- **WHEN** the canvas is serialized after an image placeholder was inserted
- **THEN** the output HTML contains an `<!-- image: ... -->` comment at that position and contains no placeholder element

#### Scenario: Alt text flows into the comment
- **WHEN** a removed image had `alt="Chart of results"`
- **THEN** the serialized comment reflects that description, e.g. `<!-- image: Chart of results -->`
