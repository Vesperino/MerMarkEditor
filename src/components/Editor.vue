<script setup lang="ts">
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { StarterKit } from "@tiptap/starter-kit";
import { Link as TiptapLink } from "@tiptap/extension-link";

// Extend Link with a custom name to avoid TipTap v3 duplicate warning
const Link = TiptapLink.extend({
  name: 'customLink',
});
import { Image as TiptapImage } from "@tiptap/extension-image";

// Extend Image to:
// 1. Always render with class="editor-image" (for CSS styling and DOM selectors)
// 2. Preserve data-original-src (relative path) through Tiptap's schema
const Image = TiptapImage.extend({
  addOptions() {
    return {
      inline: false as boolean,
      allowBase64: false as boolean,
      resize: false as const,
      ...this.parent?.(),
      HTMLAttributes: {
        class: 'editor-image',
      },
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-original-src': {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-original-src'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes['data-original-src']) return {};
          return { 'data-original-src': attributes['data-original-src'] as string };
        },
      },
    };
  },
});
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
import { watch, ref, nextTick, computed, watchEffect } from "vue";
import { Extension, Node, mergeAttributes, textblockTypeInputRule } from "@tiptap/core";
import { useEditorZoom } from "../composables/useEditorZoom";
import { useSettings } from "../composables/useSettings";
import { useFootnotes } from "../composables/useFootnotes";
import { useLineNumbers } from "../composables/useLineNumbers";
import { resolveEditorImages, getDirectoryFromFilePath } from "../utils/image-resolver";
import TableContextMenu from "./TableContextMenu.vue";
import ImagePreview from "./ImagePreview.vue";
import EditorGutter from "./EditorGutter.vue";

// Guards against false hasChanges during programmatic content updates.
// Starts at 1 to cover initial editor creation; released after 300ms.
let settingContentCount = 1;

// Prevents concurrent image resolution calls (race condition between onUpdate's
// requestAnimationFrame and watch handler's resolveEditorImages).
let imageResolutionInProgress = false;

// HTML snapshot from last file open/save — used to detect real changes (e.g. after undo).
let lastSavedHtml = '';
import { MermaidExtension } from "../extensions/MermaidExtension";
import { PageBreakExtension } from "../extensions/PageBreakExtension";
import { FootnoteRef, FootnoteSection } from "../extensions/FootnoteExtension";
import { useI18n } from "../i18n";

const { t } = useI18n();

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

// Custom Heading extension that preserves id attributes for anchor navigation
const HeadingWithId = Node.create({
  name: 'heading',
  addOptions() {
    return {
      levels: [1, 2, 3, 4, 5, 6] as HeadingLevel[],
      HTMLAttributes: {},
    };
  },
  content: 'inline*',
  group: 'block',
  defining: true,
  addAttributes() {
    return {
      level: {
        default: 1,
        rendered: false,
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('id'),
        renderHTML: (attributes: { id?: string }) => {
          if (!attributes.id) {
            return {};
          }
          return { id: attributes.id };
        },
      },
    };
  },
  parseHTML() {
    return this.options.levels.map((level: number) => ({
      tag: `h${level}`,
      attrs: { level },
    }));
  },
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];
    return [`h${level}`, mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setHeading:
        (attributes: { level: HeadingLevel }) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false;
          }
          return commands.setNode(this.name, attributes);
        },
      toggleHeading:
        (attributes: { level: HeadingLevel }) =>
        ({ commands }) => {
          if (!this.options.levels.includes(attributes.level)) {
            return false;
          }
          return commands.toggleNode(this.name, "paragraph", attributes);
        },
    };
  },
  addKeyboardShortcuts() {
    return this.options.levels.reduce(
      (items: Record<string, () => boolean>, level: HeadingLevel) => ({
        ...items,
        [`Mod-Alt-${level}`]: () => this.editor.commands.toggleHeading({ level }),
      }),
      {}
    );
  },
  addInputRules() {
    const minLevel = Math.min(...this.options.levels);
    return this.options.levels.map((level: HeadingLevel) => {
      return textblockTypeInputRule({
        find: new RegExp(`^(#{${minLevel},${level}})\\s$`),
        type: this.type,
        getAttributes: {
          level,
        },
      });
    });
  },
});

const editorContainerRef = ref<HTMLDivElement | null>(null);
const { zoomScale } = useEditorZoom();
const { settings: appSettings } = useSettings();
const editorZoomStyle = computed(() => ({ zoom: zoomScale.value }));

// Table context menu state
const showContextMenu = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

// Image preview state
const showImagePreview = ref(false);
const previewImageSrc = ref('');
const previewImageAlt = ref('');



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
  filePath?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:hasChanges": [value: boolean];
  "linkClick": [href: string];
}>();

const editor = useEditor({
  content: props.modelValue || `<p>${t.value.placeholder}</p>`,
  // Resolve local image paths to blob URLs when the editor is first created.
  // This is essential because: (1) the watch on modelValue doesn't fire for the
  // initial value, and (2) onUpdate doesn't fire during initial content creation.
  // Without this, images wouldn't display after code→visual switch (Editor recreated).
  onCreate: ({ editor: ed }) => {
    nextTick(() => {
      const editorEl = editorContainerRef.value?.querySelector('.ProseMirror');
      if (!editorEl) return;
      const baseDir = props.filePath ? getDirectoryFromFilePath(props.filePath) : undefined;
      if (!baseDir) return;
      const unresolved = editorEl.querySelectorAll(
        'img.editor-image:not([src^="blob:"]):not([src^="data:"]):not([src^="http"])'
      );
      if (unresolved.length === 0) return;
      imageResolutionInProgress = true;
      const domObs = (ed.view as any).domObserver;
      domObs?.stop();
      resolveEditorImages(editorEl, baseDir).finally(() => {
        domObs?.start();
        imageResolutionInProgress = false;
      });
    });
  },
  extensions: [
    StarterKit.configure({
      codeBlock: false,
      heading: false, // Disable default heading, use HeadingWithId instead
      listKeymap: false, // Disable built-in, use custom ListKeymap below
    }),
    HeadingWithId.configure({
      levels: [1, 2, 3, 4, 5, 6],
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
      placeholder: t.value.placeholder,
    }),
    MermaidExtension,
    PageBreakExtension,
    FootnoteRef,
    FootnoteSection,
    CharacterCount.configure({
      limit: null,
    }),
  ],
  onUpdate: ({ editor: ed }) => {
    const html = ed.getHTML();
    emit("update:modelValue", html);
    if (settingContentCount === 0) {
      emit("update:hasChanges", html !== lastSavedHtml);
    }
    footnotes.consumePendingInsert(ed);
    // Defer image resolution to next frame to avoid conflicting with ProseMirror's
    // current update cycle. Stop the DOM observer so blob URL changes don't get
    // synced back into the document model (which would corrupt save/roundtrip).
    requestAnimationFrame(() => {
      // Skip if the watch handler is already resolving images (prevents race condition
      // where this callback's .finally() starts the DOM observer while watch's
      // resolveEditorImages is still changing img.src, corrupting the model with blob URLs).
      if (imageResolutionInProgress) return;
      const editorEl = editorContainerRef.value?.querySelector('.ProseMirror');
      if (!editorEl) return;
      const unresolved = editorEl.querySelectorAll(
        'img.editor-image:not([src^="blob:"]):not([src^="data:"]):not([src^="http"])'
      );
      if (unresolved.length === 0) return;
      const baseDir = props.filePath ? getDirectoryFromFilePath(props.filePath) : undefined;
      imageResolutionInProgress = true;
      const domObs = (ed.view as any).domObserver;
      domObs?.stop();
      resolveEditorImages(editorEl, baseDir || undefined).finally(() => {
        domObs?.start();
        imageResolutionInProgress = false;
      });
    });
  },
  editorProps: {
    // Disable spell-check, autocomplete, and autocorrect to prevent interference with code blocks
    attributes: {
      spellcheck: "false",
      autocorrect: "off",
      autocapitalize: "off",
      "data-gramm": "false", // Disable Grammarly
      "data-gramm_editor": "false",
      "data-enable-grammarly": "false",
    },
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

lastSavedHtml = props.modelValue || `<p>${t.value.placeholder}</p>`;

setTimeout(() => {
  settingContentCount = Math.max(0, settingContentCount - 1);
}, 300);

watch(
  () => props.modelValue,
  async (newValue) => {
    if (editor.value && newValue !== editor.value.getHTML()) {
      settingContentCount++;
      editor.value.commands.setContent(newValue || "");
      lastSavedHtml = editor.value.getHTML();
      await nextTick();
      // Resolve local image paths to blob URLs.
      // Stop ProseMirror's DOM observer so blob URLs don't get synced into the model.
      // Set imageResolutionInProgress to prevent onUpdate's rAF from running concurrently.
      const editorEl = editorContainerRef.value?.querySelector('.ProseMirror');
      if (editorEl && props.filePath && editor.value) {
        const baseDir = getDirectoryFromFilePath(props.filePath);
        if (baseDir) {
          imageResolutionInProgress = true;
          const domObs = (editor.value.view as any).domObserver;
          domObs?.stop();
          await resolveEditorImages(editorEl, baseDir);
          domObs?.start();
          imageResolutionInProgress = false;
        }
      }
      setTimeout(() => {
        settingContentCount = Math.max(0, settingContentCount - 1);
        emit("update:hasChanges", false);
      }, 200);
    }
  }
);

// Footnote interactions (tooltip, popover, auto-open after toolbar insert)
const footnotes = useFootnotes(editor, editorContainerRef);

// Handle clicks on links, images, and footnote refs
const handleEditorClick = (event: MouseEvent) => {
  if (footnotes.handleClick(event)) return;

  const target = event.target as HTMLElement;

  // Image — open preview
  if (target.tagName === 'IMG' && target.classList.contains('editor-image')) {
    const img = target as HTMLImageElement;
    if (img.src) {
      previewImageSrc.value = img.src;
      previewImageAlt.value = img.alt || '';
      showImagePreview.value = true;
      return;
    }
  }

  // Link
  const link = target.closest('a');
  if (link) {
    event.preventDefault();
    event.stopPropagation();
    const href = link.getAttribute('href');
    if (href) emit('linkClick', href);
  }
};

// Handle right-click context menu on tables
const handleContextMenu = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const tableCell = target.closest('td, th');
  if (!tableCell || !editor.value) return;

  event.preventDefault();
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  showContextMenu.value = true;
};

const handleContextMenuAction = (action: string) => {
  if (!editor.value) return;
  const commands: Record<string, () => void> = {
    addRowBefore: () => editor.value!.chain().focus().addRowBefore().run(),
    addRowAfter: () => editor.value!.chain().focus().addRowAfter().run(),
    addColumnBefore: () => editor.value!.chain().focus().addColumnBefore().run(),
    addColumnAfter: () => editor.value!.chain().focus().addColumnAfter().run(),
    deleteRow: () => editor.value!.chain().focus().deleteRow().run(),
    deleteColumn: () => editor.value!.chain().focus().deleteColumn().run(),
    deleteTable: () => editor.value!.chain().focus().deleteTable().run(),
  };
  commands[action]?.();
};

// Update spellcheck on settings change
watch(() => appSettings.value.spellcheck, (newVal) => {
  if (editor.value) {
    editor.value.setOptions({
      editorProps: {
        ...editor.value.options.editorProps,
        attributes: {
          ...(editor.value.options.editorProps?.attributes as Record<string, string> || {}),
          spellcheck: String(newVal),
        },
      },
    });
  }
});

const proseMirrorRef = ref<HTMLElement | null>(null);
const contentWrapperRef = ref<HTMLElement | null>(null);
const showLineNumbersRef = computed(() => appSettings.value.showLineNumbers);
const { lines: lineNumberEntries } = useLineNumbers({
  containerRef: proseMirrorRef,
  anchorRef: contentWrapperRef,
  enabled: showLineNumbersRef,
});

watchEffect(() => {
  proseMirrorRef.value = (editor.value?.view?.dom as HTMLElement | undefined) ?? null;
});

defineExpose({ editor });
</script>

<template>
  <div class="editor-container" ref="editorContainerRef" @click="handleEditorClick" @contextmenu="handleContextMenu" @mouseover="footnotes.handleMouseOver" @mouseout="footnotes.handleMouseOut">
    <div
      ref="contentWrapperRef"
      class="editor-content-wrapper"
      :class="{ 'has-line-numbers': appSettings.showLineNumbers }"
      :style="editorZoomStyle"
    >
      <EditorGutter v-if="appSettings.showLineNumbers" :lines="lineNumberEntries" />
      <EditorContent :editor="editor" class="editor-content" />
    </div>
    <TableContextMenu
      v-if="showContextMenu"
      :x="contextMenuX"
      :y="contextMenuY"
      @close="showContextMenu = false"
      @action="handleContextMenuAction"
    />
    <ImagePreview
      v-if="showImagePreview"
      :src="previewImageSrc"
      :alt="previewImageAlt"
      @close="showImagePreview = false"
    />
    <div
      v-if="footnotes.tooltip.value.visible"
      class="footnote-tooltip"
      :style="{ left: footnotes.tooltip.value.x + 'px', top: footnotes.tooltip.value.y + 'px' }"
    >{{ footnotes.tooltip.value.content }}</div>
    <div
      v-if="footnotes.popover.value.visible"
      :ref="(el) => (footnotes.popoverRef.value = el as HTMLDivElement)"
      class="footnote-popover"
      :style="{ left: footnotes.popover.value.x + 'px', top: footnotes.popover.value.y + 'px' }"
      @click.stop
    >
      <div class="footnote-popover-header">
        <span class="footnote-popover-label">[^{{ footnotes.popover.value.label }}]</span>
        <button class="footnote-popover-close" @click="footnotes.closePopover" title="Close (Esc)">&#x2715;</button>
      </div>
      <textarea
        v-model="footnotes.popover.value.content"
        class="footnote-popover-textarea"
        rows="3"
        placeholder="Footnote text..."
        @keydown="footnotes.handlePopoverKeydown"
      ></textarea>
      <div class="footnote-popover-footer">
        <span class="footnote-popover-hint">Enter — save · Esc — cancel</span>
        <button class="footnote-popover-save" @click="footnotes.savePopover">Save</button>
      </div>
    </div>
  </div>
</template>

<style>
.editor-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--editor-container-bg);
}

.editor-content-wrapper {
  position: relative;
  max-width: 900px;
  margin: 20px auto;
}

.editor-content-wrapper.has-line-numbers {
  --editor-gutter-width: 3.5em;
}

.editor-content-wrapper.has-line-numbers .editor-content {
  padding-left: calc(80px + var(--editor-gutter-width));
}

.editor-content {
  background: var(--editor-content-bg);
  padding: 60px 80px;
  min-height: calc(100vh - 180px);
  box-shadow: var(--shadow-sm);
  border-radius: 4px;
}

.editor-content .tiptap {
  outline: none !important;
  border: none !important;
  min-height: 600px;
  text-align: left;
  font-family: var(--editor-font-family, inherit);
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
  line-height: var(--editor-line-height, 1.6);
  font-size: var(--editor-font-size, 16px);
}

.editor-content .tiptap h1 {
  font-size: 2em;
  font-weight: 700;
  margin: 1em 0 0.5em;
  border-bottom: 2px solid var(--heading-border);
  padding-bottom: 0.3em;
  text-align: left;
}

.editor-content .tiptap h2 {
  font-size: 1.5em;
  font-weight: 600;
  margin: 0.8em 0 0.4em;
  border-bottom: 1px solid var(--heading-border);
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
  background: var(--code-inline-bg);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: var(--code-font-family, "Fira Code", "Consolas", monospace);
  font-size: 0.9em;
}

.editor-content .tiptap pre {
  background: var(--code-block-bg);
  color: var(--code-block-text);
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
  border-left: 4px solid var(--blockquote-border);
  padding-left: 16px;
  margin: 1em 0;
  color: var(--blockquote-text);
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
  border-top: 2px solid var(--hr-color);
  margin: 2em 0;
}

.editor-content .tiptap a.editor-link {
  color: var(--link-color);
  text-decoration: underline;
  cursor: pointer;
}

.editor-content .tiptap a.editor-link:hover {
  color: var(--link-hover);
}

.editor-content .tiptap img.editor-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1em 0;
  cursor: pointer;
  transition: opacity 0.15s;
}

.editor-content .tiptap img.editor-image:hover {
  opacity: 0.85;
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
  border: 1px solid var(--border-primary);
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
  background: var(--table-header-bg);
  font-weight: 600;
}

.editor-content .tiptap table tr:hover td {
  background: var(--table-hover-bg);
}

.editor-content .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: var(--placeholder-color);
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
  background: var(--editor-container-bg);
  border-radius: 8px;
  border: 1px solid var(--border-primary);
}

.mermaid-wrapper svg {
  max-width: 100%;
}

/* Table cell selection */
.editor-content .tiptap table .selectedCell {
  background: var(--table-selection-bg);
}

.editor-content .tiptap table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: -2px;
  width: 4px;
  background-color: var(--table-resize-handle);
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

/* GitHub-style bullet variations for nested unordered lists */
.editor-content .tiptap ul {
  list-style-type: disc;
}

.editor-content .tiptap ul ul {
  list-style-type: circle;
}

.editor-content .tiptap ul ul ul {
  list-style-type: square;
}

/* Proper indentation for nested lists */
.editor-content .tiptap ul ul,
.editor-content .tiptap ol ol,
.editor-content .tiptap ul ol,
.editor-content .tiptap ol ul {
  padding-left: 1.5em;
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
  color: var(--text-muted);
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
  color: var(--h6-color);
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
  color: var(--text-faint);
  text-align: right;
  padding: 8px 16px;
  border-top: 1px solid var(--border-primary);
}

.character-count.warning {
  color: #f59e0b;
}

.character-count.danger {
  color: var(--danger-light);
}

/* Footnote reference (superscript number in text) */
.editor-content .tiptap sup.footnote-ref {
  font-size: 0.75em;
  line-height: 0;
  position: relative;
  vertical-align: super;
  color: var(--link-color);
  cursor: pointer;
  font-weight: 600;
}

.editor-content .tiptap sup.footnote-ref:hover {
  color: var(--link-hover);
  text-decoration: underline;
}

/* Footnote hover tooltip (Obsidian-style) */
.footnote-tooltip {
  position: absolute;
  transform: translateX(-50%) translateY(-100%);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  line-height: 1.5;
  max-width: 400px;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: var(--shadow-sm);
  z-index: 1000;
  pointer-events: none;
}

/* Footnote edit popover (mini-modal above sup) */
.footnote-popover {
  position: absolute;
  transform: translate(-50%, -100%);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 10px 12px;
  width: 340px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  z-index: 1001;
}

.footnote-popover-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.footnote-popover-label {
  font-family: var(--code-font-family, 'Fira Code', 'Consolas', monospace);
  font-size: 12px;
  font-weight: 600;
  color: var(--link-color);
}

.footnote-popover-close {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 12px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.footnote-popover-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.footnote-popover-textarea {
  width: 100%;
  padding: 6px 8px;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-input, var(--bg-primary));
  color: var(--text-primary);
  resize: vertical;
  box-sizing: border-box;
  outline: none;
}

.footnote-popover-textarea:focus {
  border-color: var(--primary);
}

.footnote-popover-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
}

.footnote-popover-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.footnote-popover-save {
  padding: 4px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: var(--primary);
  color: white;
  cursor: pointer;
  font-weight: 500;
}

.footnote-popover-save:hover {
  background: var(--primary-hover);
}


/* Footnotes section at document end */
.editor-content .tiptap section.footnotes {
  margin-top: 2em;
  padding-top: 0.5em;
  font-size: 0.9em;
  color: var(--text-muted);
}

.editor-content .tiptap section.footnotes hr {
  border: none;
  border-top: 1px solid var(--border-primary);
  margin-bottom: 1em;
}

.editor-content .tiptap section.footnotes ol {
  padding-left: 1.5em;
  margin: 0;
}

.editor-content .tiptap section.footnotes li {
  margin: 0.3em 0;
}

.editor-content .tiptap section.footnotes li p {
  margin: 0;
  display: inline;
}
</style>
