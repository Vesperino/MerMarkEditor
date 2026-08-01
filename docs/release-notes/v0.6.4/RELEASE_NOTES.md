# Release v0.6.4 — Drag folders in, reveal files properly, native Wayland

## Features

- Add a workspace by dragging a folder from your file manager straight onto the sidebar; drop several at once, and a folder you already have open is focused instead of added twice (#127)

## Bug fixes

- Fix "Reveal in file manager" opening your Documents folder instead of the file or folder you picked on Windows, which affected the workspace tree, the workspace header icon and the tab context menu alike (#127)
- Fix markdown files dragged in from the file manager opening as untitled copies; they now open as the real file, so Ctrl+S saves straight away and relative images load (#127)
- Fix the Linux AppImage running through the X11 compatibility layer on Wayland desktops, which caused glitches when resizing the window (#127)

## UI/UX

- Dragging inside the workspace tree feels steadier: press Escape to cancel a drag in progress, and the list scrolls on its own when you drag near the top or bottom edge (#127)
