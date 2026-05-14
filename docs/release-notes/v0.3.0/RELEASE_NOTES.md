# Release v0.3.0 — Reworked PDF export and DOCX export

The PDF export is rebuilt from scratch around a live preview dialog with full control over fonts, margins, colors, headers and footers, watermarks, and page numbering. A new DOCX export ships alongside it, and tables of contents and footnotes become clickable jumps in the exported PDF.

## Features

- Open a live PDF preview with a sidebar of settings — every change shows up in the preview before you print.
- Pick from 21 named system fonts (serif/sans/mono groups) for body and headings independently, with each option rendered in its own typeface in the dropdown.
- Adjust margins per side with four independent sliders (top, right, bottom, left), or pick a preset.
- Customize accent color and table-header background.
- Add a page header and footer with three slots each (left/center/right) and template variables `{title}`, `{date}`, `{path}`, `{page}`, `{pages}`.
- Show page numbers in three formats (`1`, `1/12`, `Page 1 of 12`) and start numbering from any page.
- Drop a watermark behind the page — custom text, color, opacity, rotation, and size.
- Save and reuse named presets (three built-ins included: Corporate Report, Notes, Draft with watermark), with the last-used settings remembered.
- Auto-generate a clickable Table of Contents with selectable heading depth (H1 through H1–H6). Footnote references jump to definitions in the PDF and back-arrows return you to the reference.
- Export to DOCX from the toolbar (Word-compatible).
- Translate the entire PDF dialog and TOC labels to English, Polish, and Chinese.

## Bug fixes

- Fix Mermaid diagrams rendering as a solid black pill in the exported PDF (the serializer was picking up the toolbar icon SVG instead of the diagram).
- Fix dark-themed Mermaid diagrams losing their text in print — text is converted to native SVG so labels survive and dark backgrounds become white for readability.
- Fix the live preview not refreshing when settings changed — preview now updates as you tweak fonts, margins, header/footer, and watermark.
- Fix Mermaid diagrams clipping wrapped node labels and triggering huge empty pages in PDF — diagrams now fit on a single page and labels are no longer cut off.
- Fix Vite dev server crashing with "too many open files" by restricting dependency scanning.

## UI/UX

- Reorganize the PDF dialog into tabs (Layout / Typography / Header & Footer / TOC / Watermark) for quicker access.
- Show a font sample under each font picker so you can see what you're choosing.
- Keep headings together with their first paragraph in PDF (no more orphan headings at the bottom of a page).
- Replace native print checkboxes with crisp Unicode glyphs (☑ / ☐) in task lists.
