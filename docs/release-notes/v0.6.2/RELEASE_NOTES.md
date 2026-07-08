# Release v0.6.2 — Indented code blocks keep their indentation

## Bug fixes

- Keep the indentation of code blocks written with 4-space indents (like directory trees or ASCII diagrams). They now render as proper code blocks in Visual mode, show up unchanged in Code mode, and saving no longer strips the spacing or rewrites them as fenced blocks. (#119)
