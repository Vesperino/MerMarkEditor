# Release v0.2.13 — Move lines / blocks with Alt+Up/Down

## Features

- **Alt+Up / Alt+Down — move the current line or block** (#80, #86) — Typora/Zettlr-style hotkey that reorders content without cut-and-paste. In the WYSIWYG editor it walks the schema up to the shallowest depth with a movable sibling, so paragraphs, headings, code blocks, blockquotes and list items all reorder at their natural level. Multi-block selections move as one unit, and atom nodes (Mermaid diagrams, horizontal rules, page breaks) keep their selection after the move so chained Alt+Up/Down presses work. In the source/code view the same shortcut reorders raw markdown lines; selections that end at column 0 of the next line are treated exclusively (matching VS Code / Sublime / IntelliJ).
- **Shortcut listed in Keyboard Shortcuts (`Ctrl+/`)** — with `en`, `pl`, and `zh-CN` translations.
