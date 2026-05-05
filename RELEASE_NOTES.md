# Release v0.2.0 — Local AI Assistant

MerMark Editor now ships with a full **local AI assistant** powered by your own `claude` and/or `codex` CLI installs. Everything runs on your machine, against your account — no third-party proxy, no telemetry, no extra API keys.

![AI panel — overview](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/ai-panel-overview.png)

## What the AI can actually do

- **Edit your markdown directly** — ask "rewrite this section in a friendlier tone", "extract action items into a bullet list", "translate the meeting notes to English". The AI writes the new content straight to disk (atomically, via `.mermark-ai.tmp`), the file watcher reloads the editor, and a snapshot is captured first so one-click **Revert** undoes the change.
- **Read across folders you authorize** — point the access map at a project folder and the AI can read any file inside it: notes from yesterday's meetings, a glossary, a style guide, related docs. No surprise reads — only paths you've added show up.
- **Modify other files in your project** — write paths in the access map let the AI create or update peer files: split a long doc into multiple notes, generate a summary alongside the source, build a table of contents file for a folder.
- **Search the web** — turn on the `network` tool toggle and the model can fetch live information (`claude` uses its built-in web tooling; `codex` uses configured search providers). Useful for fact-checking, citation lookup, latest API docs, conference dates, etc.
- **Run shell commands** — opt-in via the `bash` tool toggle when you want the AI to grep your notes folder, count files, run a build, or any other terminal task. Default off.
- **See exactly what you point at** — pin one or more highlighted fragments (Visual *and* Code view), the live selection, or the whole document. The AI gets just those, not your entire vault.

  ![Multi-pin attachments](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/multi-pin.png)

## How context reaches the model

- **Active document** — path + content (or a truncated preamble for very large docs, with a one-click "send full doc" override).
- **Live selection** — what's currently highlighted, extracted directly from the editor (TipTap `textBetween` for Visual view, raw `slice` for Code view).
- **Pinned fragments** — multi-select snippets, scrollable list above the composer, sent as one attachment block. The exact text is also recorded inline in the chat so you remember what you sent.
- **Localized scope instructions** — the preamble that tells the model "the user attached these fragments, work on them" is rendered in the editor's UI language (en / pl / zh-CN).
- **Per-document access map** — fine-grained read paths, write paths, and tool toggles (file read / file write / bash / network) constrain everything the model can touch. Add files with **+ File** or whole folders with **+ Folder**.

  ![Access map editor](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/access-map.png)

- **Bypass mode** — one-click skip of per-action confirmations *within* the access-map limits when you're iterating fast. The statusbar indicator blinks red while it's on so you don't forget.

## Chat experience

- **Two providers, one panel** — switch between `claude` and `codex` from the chat header. Per-CLI defaults persist (last model, last reasoning effort).
- **Token streaming** — replies render token-by-token, with a thinking indicator until the first chunk arrives.
- **Context window indicator** — segmented bar shows live usage (input / cache / free), pulled from each CLI's reported `modelUsage`. Reads true 1M window for Opus 4.7.

  ![Streaming + context window indicator](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/streaming-context.png)

- **Per-document threads** — every doc gets its own scrollable thread history; **+** archives the current chat and starts fresh. Up to 50 threads / doc, persisted in `localStorage`.
- **Inline tool history** — when the model calls a tool (web fetch, bash, file read, file write, etc.) the call appears as a dashed chip in the transcript with the name + args.
- **Clickable links in chat** — bare URLs and markdown links open through the existing external-link confirm dialog (same one the editor uses for `[text](https://…)` links).
- **Window controls** — minimize the panel to a tab in the corner, maximize to fullscreen, or close — all from the panel header.
- **Send shortcut** — `Ctrl+Enter` on Windows/Linux, `Cmd+Enter` on macOS.

## Safety and trust

- **Snapshot history** — rotated retention (pinned + N newest, default 3) with restore / pin / export / delete. Pre-edit snapshot is automatic on every AI write.

  ![Snapshot history](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/snapshots.png)

- **Concurrent-edit detection** — if the doc changes underneath an in-flight AI request, you're warned before applying.
- **Tmp recovery** — orphaned `.mermark-ai.tmp` from a crashed session is detected on doc open with a Restore / Discard / Show diff dialog.
- **Multi-window safe** — streaming events are scoped to the originating window so opening a second editor doesn't cross-talk.
- **Health checks + audit log** — Settings → AI shows install / authentication state for both CLIs (cached, with re-check), an append-only JSONL audit log viewer, and the runtime bypass toggle.

  ![Settings — AI](https://raw.githubusercontent.com/Vesperino/MerMarkEditor/master/docs/release-notes/v0.2.0/settings-ai.png)

- **First-run tooltip** — explains where to disable AI on first launch; AI is **on by default**.
- **Statusbar indicator** — green / red / blinking-red (bypass on); placement honors the configurable left/right panel side.

## Other

- **Resizable mermaid editor split** — drag the divider between code and preview panes in the fullscreen mermaid editor to adjust their sizes (#51).
- **Mermaid default scale** — new diagrams render at 25% by default.
- **Customizable Layout** — toolbar items move between **Top Toolbar**, **Bottom Status Bar**, and **Left Sidebar** via Settings → Layout (#43); drag & drop, hide, reorder, persisted across restarts.
- **Page break support** — `---` page breaks render correctly in Visual view and PDF export (#45).
- **Table of Contents sidebar** — collapsible left panel showing document headings with click-to-navigate (#41), toggle with `Ctrl+Shift+T`.
- **Expanded keyboard shortcuts** (#64) — `Ctrl/Cmd+W` close tab, `Ctrl/Cmd+N` new tab, `Ctrl/Cmd+Tab` / `+Shift+Tab` cycle, `Ctrl/Cmd+1..9` jump, `Ctrl/Cmd+Shift+V` toggle Code/Visual, `Ctrl/Cmd++/-/0` zoom, `Ctrl/Cmd+,` settings, `Ctrl/Cmd+/` shortcuts modal (auto-renders Mac glyphs `⌘ ⇧ ⌥`).
- **Toolbar architecture refactored** — registry-based system replacing the monolithic 1150-line Toolbar.vue.
- **Statistics grouped** — character / word / line / token counters as a single movable unit.
- **White theme option for Code view** (#67).

## Bug Fixes

- **Cursor mapping** — Code ↔ Visual position uses a source-line block parser instead of DOM estimation; survives multiple toggles, large code blocks, and font-size changes (#37).
- **Code-view tab switching** no longer loses content (#46).
- **Trailing blank lines** no longer appended on save (#53).
- **PDF export** — left bar, status bar and split dividers no longer leak into print output.
- **macOS file-open** handler (#63) and resilient line numbers (#61) — both ported from #66.
