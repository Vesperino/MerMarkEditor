# Changelog

> Auto-generated from docs/release-notes/. Run `pnpm gen:changelog` after editing.

---

# Release v0.6.0 — Marp presentations

MerMark can now build slide decks. Start a presentation in markdown, watch the real slides render live next to the editor, and present them fullscreen — all without leaving the app.

## Features

- Create slide decks in MerMark: pick **Marp presentation** when starting a new file, or open any existing deck. (#116)
- A dedicated presentation toolbar appears for decks: add a slide, choose a theme (with a small preview of each), set a slide's layout, add a slide background from a file or a link, toggle slide numbers, switch aspect ratio, and change the font size. (#116)
- Live slide preview: edit on the left and see the finished slides on the right, with the two sides scrolling together. (#116)
- Present fullscreen, advancing with arrow keys, a click, or automatically. (#116)
- Put local images and web images on your slides — they show up both in the preview and when you export. (#116)

## Bug fixes

- Fix the garbled minus symbol on the zoom control, and restore the zoom slider to the status bar. (#116)

## UI/UX

- Slide breaks now show as clear "Slide N" dividers, and a deck's settings appear as a tidy badge instead of raw tags. (#116)
- Tidy up Polish interface wording. (#116)

---

# Release v0.5.6 — Local AI models & accurate token counting

## Features

- Chat with local AI models: connect Ollama or any OpenAI-compatible server (LM Studio, llama.cpp, vLLM) from the new sections in AI settings — no cloud account needed (#92)
- Local models can read and edit your document directly, just like the cloud assistants (#92)
- The current document rides along with each message to local models, so small models answer about your file without extra round trips (#92)
- The Codex model picker now lists the models actually available in your Codex CLI instead of a fixed list (#92)
- Added the latest Claude models to the model picker (#92)
- The context bar warns when a conversation gets close to the model's limit, so you know when to start a fresh chat (#92)
- Long conversations are compacted automatically for small-context local models, keeping older turns from crowding out your question (#92)

## Bug fixes

- The context window size now matches the model you are actually chatting with — it no longer dropped to a smaller model's limit after the first reply (#99)
- The Codex context window is detected from your installed CLI instead of a stale built-in value (#99)
- Session instructions are sent once per conversation instead of with every message, so each turn wastes fewer tokens (#99)
- Token usage no longer double-counts cached tokens on Codex (#99)
- Edits proposed by local models no longer fail on Windows documents because of line-ending differences (#92)
- Pinned-fragment markers no longer leak into the document when a local model edits a pinned section (#92)

---

# Release v0.5.5 — Linux AppImage works again on Fedora and openSUSE

## Bug fixes

- Fix the Linux AppImage opening an empty window on up-to-date distributions such as Fedora and openSUSE Tumbleweed — the package no longer ships an outdated system library that broke graphics startup (#106, #109)

---

# Release v0.5.4 — Synced scrolling & live Table of Contents

## Features

- In the Code + Preview split, scrolling either pane now keeps the other roughly aligned, so the preview follows along while you edit the source.
- The Table of Contents now highlights the section you are reading and updates automatically as you scroll through the document.

---

# Release v0.5.3 — Security updates

## Security

- Update bundled dependencies to clear outstanding Dependabot security advisories (#105).

---

# Release v0.5.2 — Linux blank-window fix

## Bug fixes

- Fix the empty/blank window on Linux so the app starts and renders correctly on recent distributions such as Fedora 44 and openSUSE Tumbleweed (#106).

---

# Release v0.5.1 — macOS printing fix

## Bug fixes

- Fix the **Print / PDF** button doing nothing on macOS — the export dialog now opens the native print dialog, where you can print or save the formatted document as a PDF (#103).

---

# Release v0.5.0 — Code + Preview split editor, accurate Claude context meter

Write Markdown and watch it render at the same time, and trust the AI context meter again. This release adds a side-by-side Code + Preview editor for the document you're working on, and fixes the Claude context-usage meter so it reflects what's actually in the window.

## Features

- **Code + Preview split.** Toggle "Code + Preview" in the toolbar to edit raw Markdown on the left and see the rendered result update live on the right — both showing the same document. Mermaid diagrams you change in the preview (by hand or with the AI button) flow back into the Markdown. (#94)

## Bug fixes

- **Claude context meter no longer over-reports.** A single reply could make it look like one turn ate ~100K tokens when the real context was a fraction of that. The meter now shows the true context size for the turn. (#99)

---

# Release v0.4.1 — Read and write multiple Mermaid fence styles

## Features

- Open Mermaid diagrams written with admonition (`:::mermaid`) or tilde (`~~~mermaid`) fences in addition to the standard triple-backtick fence — useful when working with files from Docusaurus, MkDocs or other tools that use different delimiters. (#98)
- Choose which fence style the editor uses when saving Mermaid blocks, and optionally define a custom open/close pair, from Settings → Code. (#98)

---

# Release v0.4.0 — A faster, smarter workspace

This release makes the workspace sidebar feel like a real file explorer — sort how you like, select and delete in bulk, see what's unsaved at a glance — and irons out the big PDF and checklist rough edges.

## Features

- Sort each workspace or folder by name or last modified; a folder's choice applies to everything nested inside it (#93)
- Select multiple files in the workspace with Ctrl/Shift-click and delete them in one go
- Single click selects a file, double-click opens it — drag a file straight into the editor to open it
- Drop files from your computer onto the editor: images get inserted, markdown opens as a new document
- Insert a page break from the toolbar to force a new page in the exported PDF
- Create a file or folder next to (or inside) any item from the right-click menu

## Bug fixes

- Indented and nested checklists no longer break when viewed as code (#95)
- Page breaks are kept when you save and now actually start a new page in the exported PDF
- Footnote links in exported PDFs jump to the right note
- Mermaid diagrams export to PDF with clean, readable labels instead of heavy, overflowing text
- Clicking an image in the workspace inserts it instead of opening unreadable data
- Dropping or pasting several images adds them one after another instead of replacing the previous one
- Images added to an unsaved document are stored as files, so the code view shows a link instead of a long data blob
- Deleting a multi-selection from the right-click menu now removes every selected file, matching the Delete key
- The workspace tree now scrolls to the file you open or switch to

## UI/UX

- Unsaved files are flagged with a star; hover one to preview its changes
- The table of contents shows page numbers in the exported PDF
- Right-click a tab for Copy path and Reveal in file manager
- Pinned tabs move to the front of the tab bar
- Checklist checkboxes line up with their text
- Workspace search (Ctrl+Shift+E) is now listed in the keyboard shortcuts

---

# Release v0.3.0 — Reworked PDF export and DOCX export

The PDF export is rebuilt from scratch around a live preview dialog with full control over fonts, margins, colors, headers and footers, watermarks, and page numbering. A new DOCX export ships alongside it, and tables of contents and footnotes become clickable jumps in the exported PDF.

## Features

- Open a live PDF preview with a sidebar of settings — every change shows up in the preview before you print.
- Pick from 21 named system fonts (serif/sans/mono groups) for body and headings independently, with each option rendered in its own typeface in the dropdown.
- Adjust margins per side with four independent sliders (top, right, bottom, left), or pick a preset.
- Customize accent color and table-header background.
- Add a page header and footer with three slots each (left/center/right) and template variables `{title}`, `{date}`, `{path}`, `{page}`, `{pages}`.
- Show page numbers in three formats (`1`, `1/12`, `Page 1 of 12`) and start numbering from any page.
- Drop a watermark behind the page — custom text, color, opacity, rotation, and size.
- Save and reuse named presets (three built-ins included: Corporate Report, Notes, Draft with watermark), with the last-used settings remembered.
- Auto-generate a clickable Table of Contents with selectable heading depth (H1 through H1–H6). Footnote references jump to definitions in the PDF and back-arrows return you to the reference.
- Export to DOCX from the toolbar (Word-compatible).
- Translate the entire PDF dialog and TOC labels to English, Polish, and Chinese.

## Bug fixes

- Fix Mermaid diagrams rendering as a solid black pill in the exported PDF (the serializer was picking up the toolbar icon SVG instead of the diagram).
- Fix dark-themed Mermaid diagrams losing their text in print — text is converted to native SVG so labels survive and dark backgrounds become white for readability.
- Fix the live preview not refreshing when settings changed — preview now updates as you tweak fonts, margins, header/footer, and watermark.
- Fix Mermaid diagrams clipping wrapped node labels and triggering huge empty pages in PDF — diagrams now fit on a single page and labels are no longer cut off.
- Fix Vite dev server crashing with "too many open files" by restricting dependency scanning.

## UI/UX

- Reorganize the PDF dialog into tabs (Layout / Typography / Header & Footer / TOC / Watermark) for quicker access.
- Show a font sample under each font picker so you can see what you're choosing.
- Keep headings together with their first paragraph in PDF (no more orphan headings at the bottom of a page).
- Replace native print checkboxes with crisp Unicode glyphs (☑ / ☐) in task lists.

---

# Release v0.2.15 — Drag, drop, and paste images straight into your notes

## Features

- Drop image files from your file manager onto the editor and they get inserted at the spot you dropped them, copied next to the document into an `images/` folder (closes #81).
- Paste images directly from the clipboard (Ctrl+V) — works for screenshots and "Copy image" from a browser; image is saved next to the document.
- Drag an image from the workspace sidebar into the editor to insert it instead of opening it as a tab.
- Workspace sidebar now lists images alongside Markdown files so you can see what got dropped in.
- New right-click options in the workspace sidebar: create a folder and copy a file's full path.

## Bug fixes

- Top-level workspace folders can now actually be collapsed; the arrow was previously ignored.
- The right-click menu on workspace files no longer hides behind the browser's built-in image menu — you can reach Delete, Rename, etc. again.

## UI/UX

- Hover over an image in the editor to get a small delete button in the corner.
- Mermaid diagrams stay readable in dark mode — boxes are dark and labels stay bright, even when the diagram source uses light colors.
- Tooltips on toolbar and sidebar buttons now appear after ~150ms instead of the browser's slow ~600ms default.

---

# Release v0.2.14 — Per-version release notes + /release-prep

## Features

- **Browse the full changelog inside the app** (#87) — a new **Full changelog →** button on the What's New modal opens a side-by-side history view: every published version on the left, the rendered notes on the right. Translations: `en`, `pl`, `zh-CN`.
- **`/release-prep` slash command + `mermark-release-notes` skill** (#87) — invoke after `gh pr create` to bump the version, author a per-version release-notes file from the PR context, and regenerate `CHANGELOG.md` in one step.

## Under the hood

- **Release notes now live in `docs/release-notes/vX.Y.Z/RELEASE_NOTES.md`** (#87) — one folder per release. The app reads them straight from the bundle via Vite `import.meta.glob('?raw')` instead of fetching the GitHub Releases API at runtime. Root `RELEASE_NOTES.md` migrated to `docs/release-notes/v0.2.12/`; `v0.2.13` backfilled with the actual Alt+Up/Down content (its GitHub release body had been a copy of v0.2.12).
- **`scripts/gen-changelog.mjs`** (#87) — aggregates the folder into a root `CHANGELOG.md` in semver-desc order. Supports `--check` so CI can fail when the file is stale.
- **`scripts/bump-version.mjs`** (#87) — single source of truth for a release bump: writes `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, creates the per-version stub, and runs `gen-changelog`. Resolves the current version from `gh release list` (fallback `git describe --tags`).
- **Shared release-notes stylesheet** (#87) — the rendered-markdown CSS that lived inside `WhatsNewModal.vue` moved to `src/styles/release-notes.css` so both modals share one selector (`.release-notes-content`).

---

# Release v0.2.13 — Move lines / blocks with Alt+Up/Down

## Features

- **Alt+Up / Alt+Down — move the current line or block** (#80, #86) — Typora/Zettlr-style hotkey that reorders content without cut-and-paste. In the WYSIWYG editor it walks the schema up to the shallowest depth with a movable sibling, so paragraphs, headings, code blocks, blockquotes and list items all reorder at their natural level. Multi-block selections move as one unit, and atom nodes (Mermaid diagrams, horizontal rules, page breaks) keep their selection after the move so chained Alt+Up/Down presses work. In the source/code view the same shortcut reorders raw markdown lines; selections that end at column 0 of the next line are treated exclusively (matching VS Code / Sublime / IntelliJ).
- **Shortcut listed in Keyboard Shortcuts (`Ctrl+/`)** — with `en`, `pl`, and `zh-CN` translations.

---

# Release v0.2.12 — PDF fixes

## Bug fixes

- **PDF export now respects diagram size** — diagrams set to a smaller size are no longer stretched to full page width in the exported PDF.
- **Split view no longer duplicates content in PDF** — only the active (left) pane is printed when the editor is in split mode.

---

# Release v0.2.8 — Workspaces, Minimal Theme, AI in Diagrams

Workspace folders, a brand-new Minimal theme, AI editing for Mermaid diagrams, a near-WYSIWYG PDF export — the editor finally feels like a place you can stay in for hours, not just a quick-note tool.

<p>
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.6/ui-light-mode.png" alt="MerMark v0.2.4 — Minimal theme, workspace sidebar, document open" width="48%" />
  <img src="https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.6/ui-with-ai-panel.png" alt="MerMark v0.2.4 — same layout with the AI Assistant docked on the right" width="48%" />
</p>

## Workspaces

- **Multi-root workspace sidebar** (#69) — open one folder, two folders, ten. Each gets a collapsible section with file tree, drag-to-reorder header, and per-workspace controls (search, new file, open folder, menu). The active workspace shows a colored dot.
- **Folder tree like Zettlr / Obsidian** — expand / collapse subdirectories, click a file to open in a new tab, right-click for OS-level reveal, rename, delete, new file / folder. Expanded folders are remembered between sessions.
- **AI sees the workspace** — when a file lives inside an open workspace, the AI preamble includes the workspace root as a *read-only* scope. Ask "summarize the meeting notes from the last two weeks" and the model can actually traverse the folder; writes still stay scoped to the active document.
- **Quick switcher** — `Ctrl+Shift+E` opens a 3-section command palette: workspaces, files (filename match), content (full-text grep across the active workspace, debounced 150 ms, capped at 5 000 files / 4 s / 200 hits so it never stalls a big tree).
- **Migration from v0.2.x** — existing `lastRoot` workspace settings are auto-migrated to the new `openWorkspaces[]` shape on first launch.

## Minimal theme

- **Mermaid-logo palette** — teal `#14b8a6` and coral `#f43f5e` over slate `#1a2028`. Light and dark variants both ship; the variant axis is orthogonal to light/dark, so any combination works (Default + Light, Default + Dark, Minimal + Light, Minimal + Dark).
- **Editor chrome only** — accents live in tabs, sidebar headers, the active workspace dot, the AI status indicator. The document content stays neutral so prose doesn't fight for attention with the chrome.
- **Configurable padding** — Settings → General now exposes top, side, and bottom padding sliders. Values apply to both Default and Minimal themes (the previous build only wired them up for Minimal).
- **Better code blocks in Minimal** — dark slate background with full syntax highlighting, instead of the previous flat grey selection look.
- **Full-width horizontal rules** — `---` now spans the full content column.

## AI in Mermaid diagrams

- **Edit via the main AI panel** — clicking the AI button on a diagram (or in fullscreen edit) registers a target with the panel, auto-pins the diagram source as scoped context, and switches the preamble into mermaid-edit mode. You get the full panel: model picker, multi-turn conversation, threads, snapshots — same surface you use for prose.
- **Live preview, explicit Apply** — every assistant reply is parsed for a `mermaid` fenced block. The diagram renders the proposal in place, with a chip in the panel showing **Apply ✓ / Discard × / Stop**. Apply commits to the node attrs; Discard keeps the conversation going; Stop ends the session.
- **Coexists with fullscreen edit** — you don't have to leave the fullscreen mermaid editor to use the AI. The panel sits on top (`z-index: 100000`) so both stay visible; minimising the chat restores the diagram to full width.
- **Robot icon, no more star** — the diagram AI button uses the same robot glyph as the main toolbar, so it's recognizable across the app.

## PDF export — closer to WYSIWYG

- **Match the editor** — the PDF now uses the same serif font (Charter / Iowan Old Style / Palatino) at the same scale (11.5 pt / 1.7 line-height) as the Minimal editor. What you see really is what you get.
- **Editor padding → PDF margins** — your top / side / bottom padding settings are applied as `body` padding inside `@media print`, so a tight editor prints with tight margins and a roomy editor prints generously. The fixed `@page` margin (10 mm safety) layers on top of that.
- **Code blocks keep their colours** — One-Dark palette (keyword purple, string green, number / attribute orange, comment grey, …) renders inside the PDF with `-webkit-text-fill-color` set explicitly so Chromium's PDF backend doesn't strip the colour. Background stays dark slate.
- **Inline code matches the editor** — coral text (`#e11d48`) on light grey, mirroring the Minimal theme's `--danger`-tinted inline code instead of the previous teal that diverged from both on-screen variants.
- **Tables size to content** — switched from `table-layout: fixed` (which spread one-word columns and long-URL columns to equal widths) to `auto`, so a `Method | Route | Handler` table reads the way it does in the editor.
- **Hidden chrome, real layout** — the workspace sidebar collapses to zero width (not just `display: none`, which left a flex reservation), all dialogs / overlays / drag artefacts are gone, the document fills the printable width 1:1.
- **No more dark-mode bleed** — earlier builds had `html.dark[data-variant="minimal"]` selectors out-ranking the print overrides; the print block now hard-pins the entire container chain to white with hex `#ffffff` instead of relying on cascading `--bg-primary`.

## UI polish

- **Resizable Mermaid editor split** — the divider between code and preview in fullscreen mermaid edit is draggable; the ratio is persisted into the markdown via node attrs (`splitRatio`) and survives roundtrip.
- **Resizable diagram in document** — drag the right edge of an inline mermaid block to set a custom width; persisted as `userWidth`.
- **Word-style zoom slider** — the editor zoom (Ctrl + Scroll, Ctrl+/-) now has a visible slider in the status bar with `±` buttons and percentage readout. Cleaner than the dropdown that lived there before.
- **Tab pin + context menu** — right-click a tab for **Pin / Unpin / Close / Close others / Close all but pinned / Close saved / Close all**. Pinned tabs reorder to the front and survive bulk-close.
- **Quick switcher with content search** — files and live full-text grep across the active workspace, behind `Ctrl+Shift+E`.
- **Split file-ops button** — the toolbar `+` is now two buttons: "New file" and "Open folder", so the workspace flow is one click instead of two.
- **Styled prompts and confirms** — the native `window.prompt` / `window.confirm` modals are replaced with themed dialogs everywhere (rename file, delete file, conflict resolution, …).

## Bug fixes

- **`os error 123` on Windows when the AI is asked to edit a fresh / unsaved file** — both `claude` and `codex` were getting an empty `work_dir` which Windows rejects on `Command::current_dir`. The Rust spawn helpers now fall back to `$HOME` / `$USERPROFILE` / `.` when the work dir is empty.
- **`codex --cd ""` rejection** — same root cause on the codex side; `--cd` is now only set to a real path, and `--add-dir` is skipped when no work dir is known.
- **Claude / Codex CLI on macOS / Linux** (#70 — also in 0.2.3) — GUI launches inherit a minimal `PATH` so installs from Homebrew / npm-global / volta / nvm / bun / asdf were not detected. The resolver now walks a curated list of standard install dirs and falls back to a login-shell probe (`$SHELL -lc 'command -v <name>'`); Settings → AI → CLI exposes a custom-path override with the actual list of locations the app searched, so you can see what was tried.
- **AI mermaid modal not appearing on first click** — nested `<Teleport>` inside the editor fullscreen sometimes failed to mount; the modal renders in place now (and as of this release is replaced by the main AI panel anyway).
- **PDF dark-mode bleed** — multiple iterations to defeat scoped Vue styles + `html.dark[data-variant]` rules; the entire container chain is now hex-pinned to `#ffffff` in print.
- **PDF top margin too large in Minimal** — Minimal's `padding-top: 32px` stacked on top of the `@page :first` margin and gave a 2 cm gap; print now zeroes editor padding and uses `body` padding routed from your editor settings.
- **Autolink URL appendix** — TipTap autolinks `CLAUDE.md` into `<a href="http://CLAUDE.md">`, and the previous `a::after { content: " (" attr(href) ")" }` rule then printed `CLAUDE.md (http://CLAUDE.md)` next to every plain-text mention. The URL appendix is gone; PDFs embed real hyperlinks anyway.
- **Mermaid `<select>` % dropdown jankiness** — the native dropdown stole the popup layer inside the floating toolbar and the active option visually shifted on every render; replaced by four buttons (25 / 50 / 75 / 100).
- **Default mermaid scale 25 → 100** — new diagrams render at full size by default; the previous 25 % default left them tiny in the document.
- **Workspace sidebar visible in PDF** — `display: none` left a flex width reservation; the sidebar now collapses with `width: 0; visibility: hidden`.
- **AI panel tab visible in fullscreen mermaid edit** — when minimised during a mermaid AI session, the tab needs to sit above the diagram fullscreen overlay. `z-index: 100000` is now applied conditionally so it only outranks the overlay during an active mermaid edit.
- **Claude AI on Windows — `batch file arguments are invalid`** (from 0.2.5) — Claude CLI resolves to `claude.cmd` (npm shim); Rust 1.77+ rejects `.cmd` invocations with newline-bearing args (CVE-2024-24576 mitigation). The system preamble is multi-line. Spawn now uses the documented `--input-format stream-json` path universally and folds the preamble into the user message text — same pattern as the Codex spawn.
- **Codex error events surface in the chat** (from 0.2.5) — Codex's top-level `error` / `turn.failed` envelopes were being dropped by the stdout normalizer; users got a generic *"AI process exited without finalising the turn"* instead of the real reason (e.g. *"The 'gpt-5' model is not supported when using Codex with a ChatGPT account."*). The normalizer now matches both shapes and unwraps the upstream API message.
- **Last-stderr tail attached to "exited without finalising" errors** (from 0.2.5) — when an AI child genuinely dies without emitting a final JSON event the synthesised error chunk now includes the last 20 lines of the child's stderr so you don't need a debug build to diagnose it.
- **Settings → AI shows resolved binary path** (from 0.2.5) — under the version line for each CLI you can see the actual path the resolver picked (`C:\Users\…\AppData\Roaming\npm\claude.cmd`, `/opt/homebrew/bin/codex`, your custom override, …). Makes it obvious which install is in use.
- **Right-click open** (#73, from 0.2.4) — context-menu *Open with MerMark* on Windows now actually opens the file instead of failing silently.
- **Drop file from workspace tree onto split pane** — drag a file out of the sidebar onto the left or right pane in split mode and it opens there. Works on empty panes too. Capture-phase listeners outrank TipTap/ProseMirror's own dragover handler so the cursor doesn't stick in not-allowed.
- **Click on workspace file with zero tabs open** — after Close All, clicking a workspace file used to do nothing because `loadFileIntoTab` short-circuited on `findActiveTabIndex() === -1`. Falls through to `createNewTab` now.
- **Window stays open after Close All when a workspace is open** — closing the last tab no longer terminates the window when at least one workspace is loaded; the sidebar stays useful for browsing, dragging, and quick-switching.
- **Typing lag on big docs** — `useToolbarActions` is called by ~20 components (Toolbar / LeftBar / StatusBar / each ToolbarItemRenderer); each used to register its own `editor.on('update')` listener that ran `getHTML` + `htmlToMarkdown` + token recount. With many tables / code blocks this stalled typing for hundreds of milliseconds per character. Listener + token counter hoisted to module scope (one per editor); typing is responsive again.

## Under the hood

- **AI CLI path cache** — once a `claude` / `codex` binary is resolved, the path is stored in settings (`cliResolvedPathClaude` / `cliResolvedPathCodex`) and reused on subsequent probes. Cold-start health checks are now near-instant on machines where the resolver had to do a login-shell probe.
- **Settings migration** — `useSettings` deep-merges new fields on load (`editorPaddingTop / Bottom / X`, `openWorkspaces[]`, `activeWorkspaceId`, `cliResolvedPath*`), so existing installs upgrade without losing anything.
- **Markdown roundtrip for mermaid attrs** — node attributes (`userWidth`, `splitRatio`, `printScale`) survive markdown serialization via a `<!--mermaid-attrs:k=v,…-->` HTML comment immediately before the fenced block, parsed back into TipTap node attrs on load.
- **`useAiMermaidTarget` singleton** — clean bridge between the diagram node and the AI panel. The node only registers a target with `apply` and `cancel` callbacks; the singleton tracks the candidate and exposes `applyCandidate` / `discardCandidate` / `clear`. Adding new "AI edits this kind of node" surfaces will use the same pattern.
- **`useToolbarActions` listener deduped** — Toolbar / LeftBar / StatusBar / every ToolbarItemRenderer call site used to register its own `editor.on('update')` handler, so each keystroke ran ~20 copies of `getHTML` + `htmlToMarkdown` + token recount. The listener and the token counter are now hoisted to module scope (one per editor); typing on docs with many tables / code blocks no longer stalls.
