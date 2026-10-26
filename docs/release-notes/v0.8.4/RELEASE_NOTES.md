# Release v0.8.4 — Newest AI models, one-click CLI updates and synced split scrolling

Three updates came out today: 0.8.2, 0.8.3 and 0.8.4. If you skipped any of them, everything they bring is listed below, newest first.

Thanks to @zkendall and @sunao1222 for their contributions.

## New in 0.8.4

### Features

- See the newest Claude Code and Codex models in the AI panel as soon as your installed CLI knows them, without waiting for a MerMark update
- Update Claude Code or Codex with one click when a newer version is out: the AI panel and *Settings → AI* show an Update button
- Pick the reasoning effort each Codex model supports, including Extra high, Max and Ultra where available
- New default models: the latest Opus for Claude, and Codex's own default model for Codex

### Bug fixes

- Fix the Code + Preview panes no longer scrolling together

## From 0.8.3

### Bug fixes

- Update bundled components with reported security issues

## From 0.8.2

### Features

- Choose editor margins in *Settings → Editor*: Small, Medium, Large or Pageless, which fills the whole editor area (#169)
- Move through the workspace file tree with the keyboard: arrow keys, Home/End, Enter to open, F2 to rename (#170)
- See the print preview split into real pages, so you can check page breaks and page numbers before printing (#163)
- Install MerMark on NixOS with the included Nix package (#174)

### Bug fixes

- Fix headers, footers and page numbers missing from printouts on Linux and macOS (#163)
- Fix the Paragraph/Headings list in the toolbar doing nothing (#171)
- Fix line breaks and paragraphs inside quotes being merged into one line when saving (#173)
- Fix auto-save writing an empty file while the code view is open
- Fix numbered equations showing (0) and scrollbars around formulas in the PDF preview and printout
- Fix dollar amounts in indented code being shown as formulas in files with Windows line endings
- Fix a crafted image or link address in a Markdown file adding unwanted behaviour to the page

### UI/UX

- Moving around a large workspace tree stays fast
- Focus goes back to the file tree after you cancel a rename
