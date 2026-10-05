# Release v0.7.7 — Cleaner paragraphs and reliable chat paste

## Bug fixes

- Fix pasting a chat answer from Claude or ChatGPT that contains a table: text, headings and code blocks now stay in place instead of all ending up inside one table (#155)
- Keep lines that wrap in the Markdown source in one paragraph; only a blank line starts a new paragraph (#153)
- Highlight the line you clicked when switching from Visual to Code, including the exact list item, table row and code line (#156)
- Show code blocks in the light style when the Light code theme is selected, also in the Minimal layout (#152)

## UI/UX

- Theme style (Default/Minimal) now changes only the app's controls and panels; document font, spacing and colours follow your Editor settings (#152)
- Rename the "White" code theme to "Light"; your saved choice carries over (#152)
- Add clearer spacing between paragraphs (#153)
