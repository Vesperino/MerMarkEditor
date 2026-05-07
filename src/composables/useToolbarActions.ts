import { inject, ref, computed, watch, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { useI18n } from '../i18n';
import { useTokenCounter } from './useTokenCounter';
import { useEditorZoom } from './useEditorZoom';
import { htmlToMarkdown } from '../utils/markdown-converter';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

// Singleton state for dropdowns and editor update counter
const showTableMenu = ref(false);
const showImageMenu = ref(false);
const showTokenMenu = ref(false);
const editorUpdateCounter = ref(0);

// ===== Shared editor-update listener =====
// `useToolbarActions` is called by Toolbar / LeftBar / StatusBar AND by every
// ToolbarItemRenderer instance — easily 20+ call sites once the toolbar is
// rendered. Each call used to register its own `editor.on('update', …)`
// handler, so a single keystroke triggered N copies of `getHTML()` +
// `htmlToMarkdown()` + token count, scaling with the toolbar item count and
// stalling typing on docs with many tables / code blocks.
//
// The registration + token counter now live at module scope: one `update`
// listener per editor instance, one tokenizer, all consumers share the same
// reactive `tokenCount` / `currentText`. Per-instance state (zoom, dropdowns)
// stays local.
const sharedTokens = useTokenCounter();
let activeEditor: Editor | null = null;
let activeHandler: (() => void) | null = null;

function attachToEditor(ed: Editor | null | undefined) {
  if (ed === activeEditor) return;
  if (activeEditor && activeHandler) {
    activeEditor.off('update', activeHandler);
  }
  activeEditor = ed ?? null;
  activeHandler = null;
  if (!ed) return;
  const handler = () => {
    editorUpdateCounter.value++;
    if (typeof ed.getHTML === 'function') {
      const markdown = htmlToMarkdown(ed.getHTML());
      sharedTokens.updateText(markdown);
    }
  };
  activeHandler = handler;
  ed.on('update', handler);
  // Prime the counters with the current document.
  editorUpdateCounter.value++;
  sharedTokens.updateText(htmlToMarkdown(ed.getHTML()));
}

export function useToolbarActions() {
  const { t } = useI18n();
  const { zoomPercent, zoomIn, zoomOut, resetZoom, setZoom } = useEditorZoom();
  const {
    tokenCount,
    modelName,
    isVisible: showTokens,
    currentModel,
    availableModels,
    changeModel,
  } = sharedTokens;

  const editor = inject<Ref<Editor | null>>('editor');

  // Editor helpers
  const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>) => {
    if (typeof name === 'object') {
      return editor?.value?.isActive(name) ?? false;
    }
    return editor?.value?.isActive(name, attrs) ?? false;
  };

  const runCommand = (callback: (e: Editor) => void) => {
    if (editor?.value) {
      callback(editor.value);
      editor.value.commands.focus();
    }
  };

  // Character & word counts
  const characterCount = computed(() => {
    void editorUpdateCounter.value;
    return editor?.value?.storage.characterCount?.characters() ?? 0;
  });

  const wordCount = computed(() => {
    void editorUpdateCounter.value;
    return editor?.value?.storage.characterCount?.words() ?? 0;
  });

  // Drive the shared listener whenever the injected editor changes. The actual
  // attach/detach is module-scoped so multiple consumers don't pile up
  // redundant listeners on the same editor instance.
  watch(
    () => editor?.value,
    (newEditor) => attachToEditor(newEditor),
    { immediate: true },
  );

  // Heading control
  const currentHeadingLevel = computed(() => {
    if (!editor?.value) return 0;
    for (let i = 1; i <= 6; i++) {
      if (editor.value.isActive('heading', { level: i })) return i;
    }
    return 0;
  });

  const setHeading = (level: number) => {
    if (level === 0) {
      runCommand((e) => e.chain().focus().setParagraph().run());
    } else {
      runCommand((e) => e.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run());
    }
  };

  // Table operations
  const insertTable = () => {
    runCommand((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run());
    showTableMenu.value = false;
  };

  const addRowBefore = () => {
    runCommand((e) => e.chain().focus().addRowBefore().run());
    showTableMenu.value = false;
  };

  const addRowAfter = () => {
    runCommand((e) => e.chain().focus().addRowAfter().run());
    showTableMenu.value = false;
  };

  const addColumnBefore = () => {
    runCommand((e) => e.chain().focus().addColumnBefore().run());
    showTableMenu.value = false;
  };

  const addColumnAfter = () => {
    runCommand((e) => e.chain().focus().addColumnAfter().run());
    showTableMenu.value = false;
  };

  const deleteRow = () => {
    runCommand((e) => e.chain().focus().deleteRow().run());
    showTableMenu.value = false;
  };

  const deleteColumn = () => {
    runCommand((e) => e.chain().focus().deleteColumn().run());
    showTableMenu.value = false;
  };

  const deleteTable = () => {
    runCommand((e) => e.chain().focus().deleteTable().run());
    showTableMenu.value = false;
  };

  // Links and images
  const setLink = () => {
    const previousUrl = editor?.value?.getAttributes('customLink').href;
    const url = window.prompt(t.value.linkPrompt, previousUrl);
    if (url === null) return;
    if (url === '') {
      runCommand((e) => e.chain().focus().unsetLink().run());
    } else {
      runCommand((e) => e.chain().focus().setLink({ href: url }).run());
    }
  };

  const insertImageFromUrl = () => {
    showImageMenu.value = false;
    const url = window.prompt(t.value.imagePrompt);
    if (url) {
      runCommand((e) => e.chain().focus().setImage({ src: url }).run());
    }
  };

  const insertImageFromFile = async () => {
    showImageMenu.value = false;
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'] },
        ],
      });
      if (selected) {
        runCommand((e) => e.chain().focus().setImage({ src: selected as string }).run());
      }
    } catch (error) {
      console.error('Error selecting image file:', error);
    }
  };

  // Mermaid diagram
  const insertMermaid = () => {
    runCommand((e) => (e.commands as any).insertMermaid());
  };

  // Footnote — chain().focus() preserves selection after toolbar click steals focus
  const insertFootnote = () => {
    runCommand((e) => (e.chain() as any).focus().insertFootnote().run());
  };

  // Close all dropdowns
  const closeDropdowns = () => {
    showTableMenu.value = false;
    showImageMenu.value = false;
    showTokenMenu.value = false;
  };

  return {
    // Editor helpers
    editor,
    isActive,
    runCommand,

    // Stats
    characterCount,
    wordCount,
    tokenCount,
    modelName,
    showTokens,
    currentModel,
    availableModels,
    changeModel,

    // Zoom
    zoomPercent,
    zoomIn,
    zoomOut,
    resetZoom,
    setZoom,

    // Headings
    currentHeadingLevel,
    setHeading,

    // Table
    showTableMenu,
    insertTable,
    addRowBefore,
    addRowAfter,
    addColumnBefore,
    addColumnAfter,
    deleteRow,
    deleteColumn,
    deleteTable,

    // Links & images
    showImageMenu,
    setLink,
    insertImageFromUrl,
    insertImageFromFile,

    // Token menu
    showTokenMenu,

    // Mermaid
    insertMermaid,

    // Footnote
    insertFootnote,

    // Dropdowns
    closeDropdowns,

    // i18n
    t,
  };
}
