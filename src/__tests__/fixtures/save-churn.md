# Sample handbook

Write short notes. Add a [reference link](docs/reference.md) when more detail is useful.

This document contains synthetic examples for Markdown round-trip tests.
It does not describe a real project or its procedures.

## Document structure

A section can contain a heading, a paragraph, and a relative link to another page.
Use the [format guide](docs/format-guide.md#paragraphs) as an example destination.

Some paragraphs use **bold text**, *italic text*, or `inline code`.
Their original whitespace should survive a small edit elsewhere in the document.

A record can span several source lines.
The visual editor presents these lines as a single paragraph while the source
keeps the original wrapping for readable diffs.

Keep a blank line between unrelated paragraphs.

## Revision checks

Check the text before saving a document.
A save should preserve unchanged links, blank lines, and source wrapping.

A longer synthetic paragraph can include several links, such as the [first page](docs/first.md), the [second page](docs/second.md#details), and the [third page](../examples/third.md). These destinations are sample paths used only to exercise source preservation.

A sentence can contain two  spaces between words.
The visual editor may collapse those spaces for display while the saved source
retains them whenever the user has not changed that sentence.

## Additional examples

The sample document includes several short sections.
A heading edit should leave every other section intact.

Open the [reference index](docs/reference/index.md#overview) for an example link.

The last paragraph is wrapped
across two source lines.
