## New Features

- **Resizable mermaid editor split** — drag the divider between code and preview panes in the fullscreen mermaid editor to adjust their sizes (#51)
- **Mermaid default scale** — new diagrams now render at 25% by default
- **Customizable Layout** — toolbar items can now be moved between three zones: **Top Toolbar**, **Bottom Status Bar**, and **Left Sidebar** via Settings > Layout (#43)
  - Drag & drop items between zones to build your ideal layout
  - Move-to buttons (arrows) appear on hover for quick zone switching
  - Hide items you don't need — restore them anytime from the Hidden section
  - Reorder items within a zone by dragging them up/down
  - Layout is persisted in localStorage and survives app restarts
  - Default layout matches the original toolbar — fully backward compatible
- **Page break support** — `---` page breaks now render correctly in Visual view and PDF export (#45)
- **Table of Contents sidebar** — collapsible left panel showing document headings with click-to-navigate (#41)
- **Ctrl+Shift+T shortcut** to toggle the Table of Contents panel
- **Ctrl+W shortcut** to close the active tab (respects unsaved changes dialog) (#64)

## Improvements

- **Toolbar architecture refactored** — the monolithic 1150-line Toolbar.vue has been decomposed into a registry-based system with shared composables, making it maintainable and extensible
- **Statistics grouped** — character count, word count, and token counter are now a single movable unit
- **Dropdown direction** adapts to zone: downward in toolbar, upward in status bar, rightward in left sidebar

## Bug Fixes

- **Fixed:** Cursor position now maps precisely between Code and Visual views using a source-line block parser instead of DOM-based estimation (#37)
- **Fixed:** Highlight flash in code view always appears at the correct line, regardless of font size, zoom level, or document length
- **Fixed:** Position is preserved across multiple Code↔Visual toggles — switching back and forth returns to the same spot
- **Fixed:** Clicking a heading or paragraph in Visual view and switching to Code lands on the correct markdown line
- **Fixed:** Cursor inside a large code block now scrolls to and highlights the exact line within the code block in Visual view
- **Fixed:** Code view tab switching no longer loses content (#46)
- **Fixed:** Trailing blank lines no longer added at the end of markdown files on save (#53)
- **Fixed:** Left bar, status bar and split dividers no longer appear in PDF/print output
