# Release v0.8.6 — Saves that keep your Markdown as you wrote it

Thanks to @zkendall for this contribution.

## Features

- Save from the visual editor without rewriting the file: changing a word changes only that line on disk, and your line wrapping, blank lines, list markers, spacing and line endings stay as they were (#172)
- Keep the extra spaces and tabs you type in the visual editor (#172)

## Bug fixes

- Fix a lone "[" in the text, such as "@, [, {", turning everything up to the next link into one long link when you save
- Fix HTML written inside inline code, such as `<a href="...">`, turning the rest of the document into a link
- Fix a Mermaid example shown inside another code block being saved as a placeholder instead of the example
- Fix saving from the Code view dropping the blank line after headings and the final line break (#172)
- Fix a tab saved in the Code view showing as unsaved again after you switch back to the visual view
