## Bug Fixes

- **Fixed:** Cursor position now maps precisely between Code and Visual views using a source-line block parser instead of DOM-based estimation (#37)
- **Fixed:** Highlight flash in code view always appears at the correct line, regardless of font size, zoom level, or document length
- **Fixed:** Position is preserved across multiple Code↔Visual toggles — switching back and forth returns to the same spot
- **Fixed:** Clicking a heading or paragraph in Visual view and switching to Code lands on the correct markdown line
- **Fixed:** Cursor inside a large code block now scrolls to and highlights the exact line within the code block in Visual view
