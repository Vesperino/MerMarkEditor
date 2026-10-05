# Release v0.8.0 — Document styles

Pick how your documents look. Choose one of seven reading styles in *Settings → Editor → Document style*, fine-tune it, and get the same look in PDF and Word exports. Thanks to @zkendall for building this.

## Features

- Add a Document style selector with seven styles: GitHub, Obsidian Default, Obsidian Minimal, Typora GitHub, Typora Newsprint, iA Writer Helvetica and iA Writer Palatino, with a live preview (#157)
- Add per-style overrides for font, text size, line height, paragraph spacing and text width, each with its own reset (#157)
- Add a "Current Editor" PDF preset that prints with your document style, now the default for new installs (#157)
- Export Word documents with the fonts, heading sizes and spacing of your document style (#157)

## UI/UX

- Your previous font and line height carry over into the GitHub style; editor padding is now fixed and its sliders are gone (#157)
- Changing the style never changes your Markdown or marks the document as modified (#157)
