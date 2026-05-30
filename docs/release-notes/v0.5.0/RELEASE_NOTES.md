# Release v0.5.0 — Code + Preview split editor, accurate Claude context meter

Write Markdown and watch it render at the same time, and trust the AI context meter again. This release adds a side-by-side Code + Preview editor for the document you're working on, and fixes the Claude context-usage meter so it reflects what's actually in the window.

## Features

- **Code + Preview split.** Toggle "Code + Preview" in the toolbar to edit raw Markdown on the left and see the rendered result update live on the right — both showing the same document. Mermaid diagrams you change in the preview (by hand or with the AI button) flow back into the Markdown. (#94)

## Bug fixes

- **Claude context meter no longer over-reports.** A single reply could make it look like one turn ate ~100K tokens when the real context was a fraction of that. The meter now shows the true context size for the turn. (#99)
