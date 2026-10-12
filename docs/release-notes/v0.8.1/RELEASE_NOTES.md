# Release v0.8.1 — Shortcuts and menus that work everywhere

Keyboard shortcuts and menus work again on Windows and Linux, including the Minimal layout. This release also adds a command palette, lets you change any shortcut, adds a Japanese interface and fixes print margins on Linux. Thanks to @zkendall and @takdac for their contributions.

## Features

- Add a command palette (Ctrl+Shift+P or F1), Go to heading (Ctrl+Shift+O), Find next/previous (Ctrl+G / Ctrl+Shift+G) and Replace (Ctrl+H) (#161)
- Change, add or remove keyboard shortcuts in *Settings → Keyboard Shortcuts* (#161)
- Add *File → Print…* (Ctrl+P) (#162)
- Add a Japanese interface and README (#167)

## Bug fixes

- Fix keyboard shortcuts doing nothing on Windows (#165)
- Fix menu items and toolbar buttons that stopped responding, especially in the Minimal layout (#164)
- Fix bold or other formatting disappearing a moment after you applied it right after typing (#164)
- Fix Ctrl++ not zooming in (#165)
- Fix shortcuts swallowing characters typed with AltGr, such as ą, ć, ł, @, [ and { on Polish, German and French keyboards
- Fix print and PDF margins being ignored on Linux (#163)
- Fix table borders missing when you paste a copied table into Word (#160)
- Fix Undo and Redo toolbar buttons in code view
- Fix Cut, Copy and Paste in the Edit menu on Linux
- Fix line numbers drifting away from the text at zoom levels other than 100% (#159)

## UI/UX

- Clicking the zoom slider no longer greys out the Format and Insert menus (#164)
- Dialogs opened with a shortcut take the keyboard, so typing never edits the document behind them, and Escape closes them, including Print
- Toolbar buttons added in recent versions now appear for people who kept an older layout
- Ctrl+PageUp and Ctrl+PageDown also switch tabs
- Toolbar menus (table, image, token model) close when you click elsewhere or press Escape
