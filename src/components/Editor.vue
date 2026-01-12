<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextAlign } from "@tiptap/extension-text-align";
import { Highlight } from "@tiptap/extension-highlight";
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
import { common, createLowlight } from "lowlight";
import { watch, provide } from "vue";
import { MermaidExtension } from "../extensions/MermaidExtension";

const lowlight = createLowlight(common);

const props = defineProps<{
  modelValue?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:hasChanges": [value: boolean];
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
    Underline,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    Highlight.configure({
      multicolor: true,
    }),
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
  ],
  onUpdate: ({ editor }) => {
    emit("update:modelValue", editor.getHTML());
    emit("update:hasChanges", true);
  },
});

provide("editor", editor);

watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && newValue !== editor.value.getHTML()) {
      editor.value.commands.setContent(newValue || "");
    }
  }
);

defineExpose({ editor });
</script>

<template>
  <div class="editor-container">
    <EditorContent :editor="editor" class="editor-content" />
  </div>
</template>

<style>
.editor-container {
  flex: 1;
  overflow: auto;
  background: #fff;
}

.editor-content {
  max-width: 850px;
  margin: 0 auto;
  padding: 40px 60px;
  min-height: 100%;
}

.editor-content .tiptap {
  outline: none;
  min-height: 500px;
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
}

.editor-content .tiptap h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 0.2em;
}

.editor-content .tiptap h3 {
  font-size: 1.25em;
  font-weight: 600;
  margin: 0.6em 0 0.3em;
}

.editor-content .tiptap h4,
.editor-content .tiptap h5,
.editor-content .tiptap h6 {
  font-weight: 600;
  margin: 0.5em 0 0.25em;
}

.editor-content .tiptap strong {
  font-weight: 700;
}

.editor-content .tiptap em {
  font-style: italic;
}

.editor-content .tiptap u {
  text-decoration: underline;
}

.editor-content .tiptap s {
  text-decoration: line-through;
}

.editor-content .tiptap mark {
  background-color: #fef08a;
  padding: 0.1em 0.2em;
  border-radius: 2px;
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
}

.editor-content .tiptap ul,
.editor-content .tiptap ol {
  padding-left: 24px;
  margin: 0.5em 0;
}

.editor-content .tiptap li {
  margin: 0.25em 0;
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

.editor-content .tiptap table.editor-table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.editor-content .tiptap table.editor-table th,
.editor-content .tiptap table.editor-table td {
  border: 1px solid #e2e8f0;
  padding: 8px 12px;
  text-align: left;
}

.editor-content .tiptap table.editor-table th {
  background: #f8fafc;
  font-weight: 600;
}

.editor-content .tiptap table.editor-table tr:hover td {
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
</style>
