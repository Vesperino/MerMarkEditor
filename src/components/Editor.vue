<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { StarterKit } from "@tiptap/starter-kit";
import { Link } from "@tiptap/extension-link";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Placeholder } from "@tiptap/extension-placeholder";
import { CharacterCount } from "@tiptap/extension-character-count";
import { common, createLowlight } from "lowlight";
import { watch, ref } from "vue";
import { Extension } from "@tiptap/core";
import { MermaidExtension } from "../extensions/MermaidExtension";

const editorContainerRef = ref<HTMLDivElement | null>(null);

// Custom extension for list keyboard shortcuts (Tab/Shift+Tab indentation)
const ListKeymap = Extension.create({
  name: "listKeymap",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("listItem") || editor.isActive("taskItem")) {
          return editor.commands.sinkListItem("listItem") || editor.commands.sinkListItem("taskItem");
        }
        return false;
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("listItem") || editor.isActive("taskItem")) {
          return editor.commands.liftListItem("listItem") || editor.commands.liftListItem("taskItem");
        }
        return false;
      },
    };
  },
});

const lowlight = createLowlight(common);

// Helper: Parse clipboard HTML table to TipTap table format
const parseHtmlTable = (html: string): string | null => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;

  const rows = table.querySelectorAll("tr");
  if (rows.length === 0) return null;

  // Build proper TipTap-compatible table structure
  let headerRow = "";
  let bodyRows = "";

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("th, td");
    if (cells.length === 0) return;

    let rowHtml = "<tr>";
    cells.forEach((cell) => {
      const text = cell.textContent?.trim() || "\u00A0"; // non-breaking space for empty cells
      if (rowIndex === 0) {
        rowHtml += `<th><p>${text}</p></th>`;
      } else {
        rowHtml += `<td><p>${text}</p></td>`;
      }
    });
    rowHtml += "</tr>";

    if (rowIndex === 0) {
      headerRow = rowHtml;
    } else {
      bodyRows += rowHtml;
    }
  });

  // TipTap Table requires tbody, thead is optional
  let result = "<table>";
  if (headerRow) {
    result += `<thead>${headerRow}</thead>`;
  }
  result += `<tbody>${bodyRows || headerRow}</tbody>`;
  result += "</table>";

  return result;
};

// Helper: Parse plain text table (tab/pipe separated)
const parseTextTable = (text: string): string | null => {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  // Check if it looks like a table (has tabs or pipes)
  const hasTabsOrPipes = lines.some((line) => line.includes("\t") || line.includes("|"));
  if (!hasTabsOrPipes) return null;

  // Filter and parse rows
  const dataRows: string[][] = [];

  lines.forEach((line) => {
    // Skip Markdown separator line (|---|---|)
    if (/^\|?[\s\-:|]+\|?$/.test(line)) return;

    let cells: string[];
    if (line.includes("|")) {
      cells = line.split("|").map((c) => c.trim()).filter((c) => c);
    } else {
      cells = line.split("\t").map((c) => c.trim());
    }

    if (cells.length > 0) {
      dataRows.push(cells);
    }
  });

  if (dataRows.length === 0) return null;

  // Build TipTap-compatible table
  let result = "<table>";

  // First row as header
  result += "<thead><tr>";
  dataRows[0].forEach((cell) => {
    result += `<th><p>${cell || "\u00A0"}</p></th>`;
  });
  result += "</tr></thead>";

  // Remaining rows as body
  result += "<tbody>";
  for (let i = 1; i < dataRows.length; i++) {
    result += "<tr>";
    dataRows[i].forEach((cell) => {
      result += `<td><p>${cell || "\u00A0"}</p></td>`;
    });
    result += "</tr>";
  }
  // If only header, duplicate as body row (TipTap needs at least one body row)
  if (dataRows.length === 1) {
    result += "<tr>";
    dataRows[0].forEach((cell) => {
      result += `<td><p>${cell || "\u00A0"}</p></td>`;
    });
    result += "</tr>";
  }
  result += "</tbody></table>";

  return result;
};

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:hasChanges": [value: boolean];
  "linkClick": [href: string];
}>();

const editor = useEditor({
  content: props.modelValue || "<p>Zacznij pisać...</p>",
  extensions: [
    StarterKit.configure({
      codeBlock: false,
      heading: {
        levels: [1, 2, 3, 4, 5, 6],
      },
    }),
    ListKeymap,
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: "editor-link",
      },
    }),
    Image.configure({
      HTMLAttributes: {
        class: "editor-image",
      },
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        class: "editor-table",
      },
    }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    CodeBlockLowlight.configure({
      lowlight,
    }),
    Placeholder.configure({
      placeholder: "Zacznij pisać lub wklej tekst...",
    }),
    MermaidExtension,
    CharacterCount.configure({
      limit: null,
    }),
  ],
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getHTML());
    emit("update:hasChanges", true);
  },
  editorProps: {
    handlePaste: (_view, event) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return false;

      // Try HTML table first (case-insensitive check)
      const html = clipboardData.getData("text/html");
      if (html && /<table/i.test(html)) {
        const tableHtml = parseHtmlTable(html);
        if (tableHtml && editor.value) {
          editor.value.chain().focus().insertContent(tableHtml).run();
          return true;
        }
      }

      // Try plain text table (tab-separated or pipe-separated)
      const text = clipboardData.getData("text/plain");
      if (text) {
        const tableHtml = parseTextTable(text);
        if (tableHtml && editor.value) {
          editor.value.chain().focus().insertContent(tableHtml).run();
          return true;
        }
      }

      return false; // Let default paste handler work
    },
  },
});

watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && newValue !== editor.value.getHTML()) {
      editor.value.commands.setContent(newValue || "");
    }
  }
);

// Handle clicks on links
const handleEditorClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;

  // Check if clicked element is a link or is inside a link
  const link = target.closest('a');
  if (link) {
    event.preventDefault();
    event.stopPropagation();
    const href = link.getAttribute('href');
    if (href) {
      emit('linkClick', href);
    }
  }
};

defineExpose({ editor });
</script>

<template>
  <div class="editor-container" ref="editorContainerRef" @click="handleEditorClick">
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<style>
.editor-container {
  flex: 1;
  overflow: auto;
  background: #f8fafc;
}

.editor-content {
  background: #fff;
  max-width: 900px;
  margin: 20px auto;
  padding: 60px 80px;
  min-height: calc(100vh - 180px);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.editor-content .tiptap {
  outline: none !important;
  border: none !important;
  min-height: 600px;
  text-align: left;
}

.editor-content .tiptap:focus {
  outline: none !important;
  border: none !important;
}

.editor-content > div {
  outline: none !important;
  border: none !important;
}

.ProseMirror {
  outline: none !important;
  border: none !important;
  text-align: left;
}

.ProseMirror:focus {
  outline: none !important;
  border: none !important;
}

/* Ensure all block elements are left-aligned by default */
.editor-content .tiptap > * {
  text-align: left;
}

.editor-content .tiptap p {
  margin: 0.5em 0;
  line-height: 1.6;
}

.editor-content .tiptap h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1em 0 0.5em;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 0.3em;
  text-align: left;
}

.editor-content .tiptap h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.2em;
  text-align: left;
}

.editor-content .tiptap h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.6em 0 0.3em;
  text-align: left;
}

.editor-content .tiptap h4,
.editor-content .tiptap h5,
.editor-content .tiptap h6 {
  font-weight: 600;
  margin: 0.5em 0 0.25em;
  text-align: left;
}

.editor-content .tiptap strong {
  font-weight: 700;
}

.editor-content .tiptap em {
  font-style: italic;
}

.editor-content .tiptap s {
  text-decoration: line-through;
}

.editor-content .tiptap code {
  background: #f1f5f9;
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 0.9em;
}

.editor-content .tiptap pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px 20px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 1em 0;
}

.editor-content .tiptap pre code {
  background: none;
  padding: 0;
  color: inherit;
}

.editor-content .tiptap blockquote {
  border-left: 4px solid #2563eb;
  padding-left: 16px;
  margin: 1em 0;
  color: #64748b;
  font-style: italic;
  text-align: left;
}

.editor-content .tiptap blockquote p {
  margin: 0;
  text-align: left;
}

.editor-content .tiptap ul,
.editor-content .tiptap ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
  text-align: left;
}

.editor-content .tiptap li {
  margin: 0.25em 0;
  text-align: left;
}

.editor-content .tiptap li p {
  margin: 0;
  text-align: left;
}

.editor-content .tiptap ul[data-type="taskList"] {
  list-style: none;
  padding-left: 0;
}

.editor-content .tiptap ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.editor-content .tiptap ul[data-type="taskList"] li > label {
  margin-top: 0.25em;
}

.editor-content .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.editor-content .tiptap hr {
  border: none;
  border-top: 2px solid #e2e8f0;
  margin: 2em 0;
}

.editor-content .tiptap a.editor-link {
  color: #2563eb;
  text-decoration: underline;
  cursor: pointer;
}

.editor-content .tiptap a.editor-link:hover {
  color: #1d4ed8;
}

.editor-content .tiptap img.editor-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1em 0;
}

/* Table styles - apply to all tables */
.editor-content .tiptap table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  table-layout: fixed;
}

.editor-content .tiptap table th,
.editor-content .tiptap table td {
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  text-align: left;
  vertical-align: top;
  min-width: 50px;
}

.editor-content .tiptap table th p,
.editor-content .tiptap table td p {
  margin: 0;
  text-align: left;
}

.editor-content .tiptap table th {
  background: #f8fafc;
  font-weight: 600;
}

.editor-content .tiptap table tr:hover td {
  background: #f8fafc;
}

.editor-content .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: #94a3b8;
  pointer-events: none;
  height: 0;
}

/* Syntax highlighting */
.editor-content .tiptap pre .hljs-keyword { color: #c678dd; }
.editor-content .tiptap pre .hljs-string { color: #98c379; }
.editor-content .tiptap pre .hljs-number { color: #d19a66; }
.editor-content .tiptap pre .hljs-function { color: #61afef; }
.editor-content .tiptap pre .hljs-comment { color: #5c6370; font-style: italic; }
.editor-content .tiptap pre .hljs-variable { color: #e06c75; }
.editor-content .tiptap pre .hljs-attr { color: #d19a66; }
.editor-content .tiptap pre .hljs-tag { color: #e06c75; }

/* Mermaid blocks */
.mermaid-wrapper {
  margin: 1em 0;
  padding: 16px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.mermaid-wrapper svg {
  max-width: 100%;
}

/* Table cell selection */
.editor-content .tiptap table .selectedCell {
  background: #dbeafe;
}

.editor-content .tiptap table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: -2px;
  width: 4px;
  background-color: #2563eb;
  pointer-events: none;
}

/* Ensure table cells are editable */
.editor-content .tiptap table td,
.editor-content .tiptap table th {
  position: relative;
}

/* Nested lists */
.editor-content .tiptap ul ul,
.editor-content .tiptap ul ol,
.editor-content .tiptap ol ul,
.editor-content .tiptap ol ol {
  margin: 0.25em 0;
}

/* Definition list styles (dl, dt, dd) */
.editor-content .tiptap dl {
  margin: 1em 0;
}

.editor-content .tiptap dt {
  font-weight: 600;
  margin-top: 0.5em;
}

.editor-content .tiptap dd {
  margin-left: 1.5em;
  color: #64748b;
}

/* Additional heading styles */
.editor-content .tiptap h4 {
  font-size: 1.1em;
}

.editor-content .tiptap h5 {
  font-size: 1em;
}

.editor-content .tiptap h6 {
  font-size: 0.9em;
  color: #64748b;
}

/* Remove focus ring - clean look */
.editor-content .tiptap:focus-visible {
  outline: none !important;
}

/* Better paragraph spacing */
.editor-content .tiptap p + p {
  margin-top: 0.75em;
}

/* Character counter styles */
.character-count {
  font-size: 12px;
  color: #94a3b8;
  text-align: right;
  padding: 8px 16px;
  border-top: 1px solid #e2e8f0;
}

.character-count.warning {
  color: #f59e0b;
}

.character-count.danger {
  color: #ef4444;
}
</style>
