# Release v0.6.5 — Links inside your document jump where they should

## Bug fixes

- Fix clicking a `[Section](#section)` link doing nothing at all; it now scrolls to the heading (#132)
- Fix headings containing dashes, ampersands, accented letters or non-Latin script getting anchors no link could reach, so Polish and Chinese headings now work like any other (#132)
- Fix links to a repeated heading always landing on the first one; every repeat now gets its own anchor (#132)
- Fix anchor links searching the wrong side in split view instead of the pane you are looking at (#132)
- Fix a document containing an unusual numeric character code failing to open (#132)

## UI/UX

- Heading anchors now match the ones GitHub produces, so a link copied out of a document rendered on GitHub resolves here too. Links written against MerMark's older anchors still work where the two differ only in dashes; the few that leaned on how ampersands or accented letters used to be handled need updating (#132)
- Show a notice when a link points at a heading the document does not contain, instead of leaving the click looking like nothing happened (#132)
