# Release v0.7.3 — Math formulas and easier Codex setup

## Features

- Add inline and display math formulas, including fractions, matrices and multi-line equations, with common LaTeX delimiters and fenced math blocks (#144)
- Edit formulas directly in the visual editor while preserving their original Markdown syntax on save (#144)
- Include rendered formulas in PDF exports even offline, support alternative formula syntax in slides, and retain LaTeX source as text in Word exports (#144)

## Bug fixes

- Find Codex in more Windows installation locations, including installations managed by the desktop app, and reject desktop launchers that cannot run as a CLI (#144)
- Refresh automatically detected Codex paths when checking again, respect manually selected paths, and use the verified installation for conversations (#144)

## UI/UX

- Add toolbar buttons for inline and display formulas, with double-click or keyboard editing (#144)
- Expand manual executable selection after connection errors and explain which Codex file to choose (#144)
