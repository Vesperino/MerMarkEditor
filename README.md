<p align="center">
  <img src="assets/mermark-banner.jpeg" alt="MerMark Editor - Mermaid Markdown Editor" width="600">
</p>

<p align="center">
  <strong>A modern, open-source Markdown editor with built-in Mermaid diagram support</strong>
</p>

<p align="center">
  <a href="https://github.com/Vesperino/MerMarkEditor/releases"><img src="https://img.shields.io/github/v/release/Vesperino/MerMarkEditor?style=flat" alt="Release"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/blob/master/LICENSE"><img src="https://img.shields.io/github/license/Vesperino/MerMarkEditor?style=flat" alt="License"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/stargazers"><img src="https://img.shields.io/github/stars/Vesperino/MerMarkEditor?style=flat" alt="Stars"></a>
  <a href="https://github.com/Vesperino/MerMarkEditor/releases"><img src="https://img.shields.io/github/downloads/Vesperino/MerMarkEditor/total?style=flat" alt="Downloads"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#screenshots">Screenshots</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#development">Development</a> •
  <a href="README_PL.md">Polski</a>
</p>

---

## Why MerMark Editor?

**MerMark Editor** combines the simplicity of Markdown with the power of Mermaid diagrams in a beautiful, native desktop application. Perfect for developers, technical writers, and anyone who needs to create documentation with flowcharts, sequence diagrams, and other visualizations.

### Key Benefits

- **No cloud dependency** - Your documents stay on your computer
- **Native performance** - Built with Tauri for fast, lightweight operation
- **WYSIWYG editing** - See your formatted content as you type
- **Mermaid integration** - Create diagrams directly in your documents
- **Cross-platform** - Available on Windows, macOS and Linux

---

## Features

### Markdown Editing
- Full **GitHub Flavored Markdown** (GFM) support
- **WYSIWYG editor** with live preview
- **Syntax highlighting** for code blocks (50+ languages)
- Tables, task lists, blockquotes, and more
- **Keyboard shortcuts** for efficient editing

### Mermaid Diagrams
- **Flowcharts** - Visualize processes and workflows
- **Sequence diagrams** - Document system interactions
- **Class diagrams** - Design software architecture
- **State diagrams** - Model state machines
- **Entity Relationship diagrams** - Database design
- **Gantt charts** - Project planning
- **Pie charts** - Data visualization
- And many more diagram types!

### Export & Integration
- **Export to PDF** with proper formatting
- **Save as Markdown** (.md files)
- Clean, portable file format

### User Experience
- **Tab support** - Work with multiple documents
- **Dark/Light themes** - Easy on the eyes
- **Character & word count** - Track your progress
- **Auto-save** - Never lose your work
- **Bilingual UI** - English and Polish interface
- **Keyboard shortcuts modal** - Quick reference for all shortcuts (`Ctrl+/`)

### Advanced Features
- **Split View** - Edit two documents side by side with adjustable split ratio
- **Compare Tabs** - Diff comparison between left and right pane documents (`Ctrl+Shift+C`)
- **Change Tracking** - View all changes made since last save (`Ctrl+Shift+D`)
- **Code View** - Switch between visual WYSIWYG and raw Markdown with cursor position tracking
- **AI Token Counter** - Estimate tokens for GPT (OpenAI), Claude (Anthropic), and Gemini (Google)
- **Multi-window support** - Open multiple independent editor windows
- **Cross-window tab management** - Drag and drop tabs between panes and windows

---

## Screenshots

<p align="center">
<img width="3835" height="2071" alt="{03A741AD-0E65-42CC-9506-0C0EC0C8CF77}" src="https://github.com/user-attachments/assets/6dae5f4b-28b0-4803-9f07-9ac8b71581bb" />
  <br>
  <em>Dark mode</em>
</p>

<p align="center">
<img width="3837" height="2071" alt="{E38EA017-7177-4EBC-A5B9-3F8A4C905F14}" src="https://github.com/user-attachments/assets/ce4bbd47-5df3-445a-af3a-b13cadf5db3f" />
  <br>
  <em>Clean, minimalist interface with intuitive toolbar</em>
</p>

<p align="center">
<img width="3840" height="2078" alt="{AD7741E3-C03B-4450-B8A8-460E9E22BF3D}" src="https://github.com/user-attachments/assets/f8e5ef5b-bc36-45b6-8019-29c22f9aee48" />
  <br>
  <em>Multi-tab editing with formatted documents and clickable table of contents</em>
</p>

<p align="center">
  <img width="3828" height="2075" alt="{99F3795E-DB3D-4197-A14B-DC068C25989F}" src="https://github.com/user-attachments/assets/8d911a3a-e5e6-40dc-8d17-7e624a8c17c9" />
  <br>
  <em>C4 Architecture diagrams with zoom controls and fullscreen mode</em>
</p>

<p align="center">
 <img width="3820" height="2038" alt="{F89EA26C-2E77-46E0-B8C7-C4FF18B263E9}" src="https://github.com/user-attachments/assets/21d560c1-25bd-41a0-b1ed-83e356ff26d3" />
  <br>
  <em>Fullscreen diagram view with 400% zoom for detailed inspection</em>
</p>

<p align="center">
  <img width="1578" height="742" alt="{55AD4147-7F6E-4A92-BE1F-A1CEC80A792D}" src="https://github.com/user-attachments/assets/5969be85-95a1-4199-a378-cfeb6075c48d" />
  <br>
  <em>Technical documentation with code blocks and embedded diagrams</em>
</p>

<p align="center">
<img width="3831" height="2081" alt="{83B531B5-DD75-4850-B41E-BC7AE01EF82B}" src="https://github.com/user-attachments/assets/6fb41a24-958e-42c6-a56a-81ecf0d72a9d" />
  <br>
  <em>Split view for editing two documents simultaneously</em>
</p>

<p align="center">
<img width="3830" height="2072" alt="{118A90EF-97EE-463F-8C2E-63F06D69D75D}" src="https://github.com/user-attachments/assets/804dfb96-9d84-4bd6-ad3d-b6d0a8dbca06" />
  <br>
  <em>Compare documents side by side with line-level diff highlighting</em>
</p>

<p align="center">
<img width="3822" height="2073" alt="{CD31C3AF-C82A-4984-AB34-7B033CC035AD}" src="https://github.com/user-attachments/assets/e4d2fcc5-d1a4-41f0-b7c7-16a389801206" />
  <br>
  <em>View all changes made since last save with additions and deletions</em>
</p>

<p align="center">
<img width="3836" height="2076" alt="{454ECDFD-CE4B-4AA8-8A37-B972419B7ABB}" src="https://github.com/user-attachments/assets/c4823de1-4b66-4065-8c66-15b184d8619e" />
  <br>
  <em>Toggle between visual and Markdown code view with cursor tracking</em>
</p>

<p align="center">
<img width="3834" height="1633" alt="{E3861707-CF03-4497-874E-AC88EE2FB29B}" src="https://github.com/user-attachments/assets/4594b71c-cb50-479d-ba8c-dd053efd34db" />
  <br>
  <em>Quick reference for all keyboard shortcuts (Ctrl+/)</em>
</p>

<p align="center">
<img width="829" height="306" alt="{766E35F6-7699-426A-9BC9-8ED46FEA249F}" src="https://github.com/user-attachments/assets/8ffcf467-f02a-41e2-bda6-dda4fa44322d" />
  <br>
  <em>AI token counter with model selection (GPT, Claude, Gemini)</em>
</p>

<p align="center">
<img width="3019" height="1565" alt="{A9692CF1-B62D-4B3B-B27B-D561D689DFE7}" src="https://github.com/user-attachments/assets/a28effaa-3e5b-4a9b-8b58-7fb4f4053d15" />
  <br>
  <em>Multiple windows with cross-window tab drag and drop</em>
</p>

---

## Installation

### Download

Download the latest version from the [Releases page](https://github.com/Vesperino/MerMarkEditor/releases).

| Platform | Download |
|----------|----------|
| Windows  | [.exe / .msi installer](https://github.com/Vesperino/MerMarkEditor/releases/latest) |
| macOS    | [.dmg (universal: Apple Silicon + Intel)](https://github.com/Vesperino/MerMarkEditor/releases/latest) |
| Linux    | [.deb / .AppImage](https://github.com/Vesperino/MerMarkEditor/releases/latest) |

### System Requirements

- **Windows**: Windows 10 or later (64-bit)
- **macOS**: macOS 10.15 (Catalina) or later
- **Linux**: Ubuntu 22.04+ or equivalent (WebKitGTK 4.1 required)

---

## Usage

### Basic Editing

1. **Open a file**: `Ctrl+O` (or `Cmd+O` on macOS)
2. **Save**: `Ctrl+S` (saves as Markdown)
3. **Save As**: `Ctrl+Shift+S`
4. **Export to PDF**: Click the PDF button in toolbar

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New file | `Ctrl+N` |
| Open file | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Export PDF | `Ctrl+P` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Bold | `Ctrl+B` |
| Italic | `Ctrl+I` |
| Show changes | `Ctrl+Shift+D` |
| Compare tabs | `Ctrl+Shift+C` |
| Keyboard shortcuts | `Ctrl+/` |
| Close modal | `Escape` |

### Creating Mermaid Diagrams

Click the **Mermaid** button in the toolbar or type:

~~~markdown
```mermaid
graph LR
    A[Start] --> B[Process]
    B --> C[End]
```
~~~

This creates a flowchart:

```
[Start] --> [Process] --> [End]
```

### Supported Diagram Types

- `graph` / `flowchart` - Flow diagrams
- `sequenceDiagram` - Sequence diagrams
- `classDiagram` - Class diagrams
- `stateDiagram-v2` - State diagrams
- `erDiagram` - Entity Relationship diagrams
- `gantt` - Gantt charts
- `pie` - Pie charts
- `journey` - User journey diagrams
- `gitgraph` - Git graphs
- `mindmap` - Mind maps
- `timeline` - Timelines

---

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (for Tauri)
- [pnpm](https://pnpm.io/) (recommended)

### Setup

```bash
# Clone the repository
git clone https://github.com/Vesperino/MerMarkEditor.git
cd MerMarkEditor

# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

### Running Tests

```bash
# Run tests
pnpm test

# Run tests once
pnpm test:run
```

### Tech Stack

- **Frontend**: Vue 3 + TypeScript
- **Editor**: TipTap (ProseMirror-based)
- **Diagrams**: Mermaid.js
- **Desktop**: Tauri 2.0
- **Build**: Vite

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [Codycody31](https://github.com/Codycody31) - Huge thanks for macOS and Linux support!
- [TipTap](https://tiptap.dev/) - Headless editor framework
- [Mermaid](https://mermaid.js.org/) - Diagramming and charting tool
- [Tauri](https://tauri.app/) - Desktop application framework
- [Vue.js](https://vuejs.org/) - Progressive JavaScript framework

---

## Support

If you find this project useful, please consider:

- Giving it a star on GitHub
- Reporting bugs and suggesting features
- Contributing to the codebase

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Vesperino">Vesperino</a>
</p>

<!-- SEO Keywords (hidden): markdown editor, mermaid diagrams, flowchart editor, sequence diagram tool, documentation editor, technical writing, wysiwyg markdown, desktop markdown editor, open source markdown, diagram markdown editor, best markdown editor, free markdown editor, markdown with diagrams, mermaid markdown editor, offline markdown editor -->
