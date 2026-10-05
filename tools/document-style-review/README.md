# Document style review

A reusable comparison of MerMark's seven document styles. Both panes use the app's read-only editor, Markdown converter, and shared style registry. This is a development tool, not a second implementation of document styling.

```sh
pnpm install --frozen-lockfile
pnpm themes:preview
# In another terminal, while the preview is running:
pnpm themes:render
```

The preview runs at http://localhost:1434. `THEME_REVIEW_URL` can point the render command at another instance. Generated screenshots, metrics, and self-contained HTML documents go to `output/playwright/document-style-review/`, which is ignored by Git. The tool uses its own Vite dependency cache so it can run alongside the app.

Choose two styles, jump to a demo section, or scroll either pane. Synchronized scrolling follows corresponding document blocks, rather than percentages of documents with different heights. The default comparison uses 16px text and a 680px reading column; Native font size restores the reference size (15px for the iA templates). Dark switches the document palette without changing typography. Export HTML embeds required fonts and mathematics, and serializes rendered Mermaid diagrams.

The demo covers H1–H6, wrapped headings, paragraph rhythm, source newlines and hard breaks, inline formatting, nested/loose/ordered/task lists, nested quotations, dividers, aligned tables, highlighted/unhighlighted code, images and captions, mathematics, footnotes, and Mermaid.

## Sources and adaptations

See [PROVENANCE.md](PROVENANCE.md) for pinned upstream GitHub references, actual template download sources, font licenses, and adaptations. Every style's CSS and typed definition also carry its source information.

Styles are application-wide reading preferences. Selecting a style does not modify Markdown files. Font size, spacing, and width overrides are remembered separately for each style. Appearance Default/Minimal only changes app chrome.

## Exports

PDF's **Current Editor** preset follows the active document style, its overrides, and Code Light/Dark. Page size and margins determine printable width; screen zoom, padding, and reading width are excluded. Existing PDF presets retain their previous formatting. Typography edits create a custom snapshot; print-layout edits can continue following Current Editor. Saving an inherited configuration as a custom preset snapshots its typography.

DOCX translates shared style metadata into Word fonts, sizes, heading emphasis, spacing, shading, and borders. Word uses integer half-points/twips; weights are represented as regular or bold. iA H6 remains a separate semantic heading. Platform fonts and document fonts must be available in the receiving Word installation; fonts are embedded in HTML/PDF, not DOCX. Existing limitations for diagrams, images, and mathematics in DOCX are unchanged. Marp retains its presentation themes.
