# Release v0.2.15 — Drag, drop, and paste images straight into your notes

## Features

- Drop image files from your file manager onto the editor and they get inserted at the spot you dropped them, copied next to the document into an `images/` folder (closes #81).
- Paste images directly from the clipboard (Ctrl+V) — works for screenshots and "Copy image" from a browser; image is saved next to the document.
- Drag an image from the workspace sidebar into the editor to insert it instead of opening it as a tab.
- Workspace sidebar now lists images alongside Markdown files so you can see what got dropped in.
- New right-click options in the workspace sidebar: create a folder and copy a file's full path.

## Bug fixes

- Top-level workspace folders can now actually be collapsed; the arrow was previously ignored.
- The right-click menu on workspace files no longer hides behind the browser's built-in image menu — you can reach Delete, Rename, etc. again.

## UI/UX

- Hover over an image in the editor to get a small delete button in the corner.
- Mermaid diagrams stay readable in dark mode — boxes are dark and labels stay bright, even when the diagram source uses light colors.
- Tooltips on toolbar and sidebar buttons now appear after ~150ms instead of the browser's slow ~600ms default.
