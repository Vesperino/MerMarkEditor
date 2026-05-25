# Release v0.4.0 — A faster, smarter workspace

This release makes the workspace sidebar feel like a real file explorer — sort how you like, select and delete in bulk, see what's unsaved at a glance — and irons out the big PDF and checklist rough edges.

## Features

- Sort each workspace or folder by name or last modified; a folder's choice applies to everything nested inside it (#93)
- Select multiple files in the workspace with Ctrl/Shift-click and delete them in one go
- Single click selects a file, double-click opens it — drag a file straight into the editor to open it
- Drop files from your computer onto the editor: images get inserted, markdown opens as a new document
- Insert a page break from the toolbar to force a new page in the exported PDF
- Create a file or folder next to (or inside) any item from the right-click menu

## Bug fixes

- Indented and nested checklists no longer break when viewed as code (#95)
- Page breaks are kept when you save and now actually start a new page in the exported PDF
- Footnote links in exported PDFs jump to the right note
- Mermaid diagrams export to PDF with clean, readable labels instead of heavy, overflowing text
- Clicking an image in the workspace inserts it instead of opening unreadable data
- Dropping or pasting several images adds them one after another instead of replacing the previous one
- Images added to an unsaved document are stored as files, so the code view shows a link instead of a long data blob
- Deleting a multi-selection from the right-click menu now removes every selected file, matching the Delete key
- The workspace tree now scrolls to the file you open or switch to

## UI/UX

- Unsaved files are flagged with a star; hover one to preview its changes
- The table of contents shows page numbers in the exported PDF
- Right-click a tab for Copy path and Reveal in file manager
- Pinned tabs move to the front of the tab bar
- Checklist checkboxes line up with their text
- Workspace search (Ctrl+Shift+E) is now listed in the keyboard shortcuts
