# Release v0.8.7 — Image tabs, a document outline and a view switch that stays put

Thanks to @zkendall and @tobiasgrossmann for these contributions.

## Features

- Open images in their own tab: click a link to an image in your document, or double-click an image in the file tree, then zoom and pan while your document stays open in the next tab (#184)
- Jump around long documents with the new outline: hover the slim heading rail beside the text to see every section, or switch to the side panel in Settings → Appearance → Document outline (#180)
- Collapse or expand every folder of a workspace at once from the workspace's right-click menu, or Alt-click a folder to open or close its whole branch (#182)
- Format selected text from the right-click menu on Windows, macOS and Linux: headings, bold, italic, lists, quotes and table actions are now one click away (#183)
- Keep your selection when you switch between the Visual and Code views: the same text stays selected and in view on the other side
- Run MerMark on Windows without admin rights: download the portable ZIP, unzip it anywhere and start MerMark Editor.exe (#185)

## Bug fixes

- Fix switching between the Visual and Code views landing in the wrong place in long documents, most visibly after images, diagrams and formulas or in documents that repeat the same text
- Fix the view scrolling away from your place right after returning to the Visual view while diagrams and images were still loading
- Fix custom AI models served by llama.cpp failing with "System message must be at the beginning" (#187)
- Fix the file path tooltip covering the tab's right-click menu (#181)
- Fix menu bar titles longer than ten letters, such as "Presentation", losing their last letters in the dark theme on Windows
