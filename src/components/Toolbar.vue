<script setup lang="ts">
import { inject, ref, computed, watch, onUnmounted, type Ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { useI18n } from "../i18n";
import { useSettings } from "../composables/useSettings";
import { useTokenCounter } from "../composables/useTokenCounter";
import { htmlToMarkdown } from "../utils/markdown-converter";

const { t, locale, toggleLocale } = useI18n();
const { settings, toggleAutoSave } = useSettings();
const {
  tokenCount,
  modelName,
  isVisible: showTokens,
  currentModel,
  availableModels,
  updateText,
  changeModel,
} = useTokenCounter();
const editor = inject<Ref<Editor | null>>("editor");

const showTableMenu = ref(false);

// Reactive counter for triggering recomputation when editor updates
const editorUpdateCounter = ref(0);

const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>) => {
  if (typeof name === 'object') {
    return editor?.value?.isActive(name) ?? false;
  }
  return editor?.value?.isActive(name, attrs) ?? false;
};

const runCommand = (callback: (e: Editor) => void) => {
  if (editor?.value) {
    callback(editor.value);
  }
};

// Character count - depends on editorUpdateCounter for reactivity
const characterCount = computed(() => {
  // Access update counter to make computed reactive to editor changes
  void editorUpdateCounter.value;
  return editor?.value?.storage.characterCount?.characters() ?? 0;
});

const wordCount = computed(() => {
  // Access update counter to make computed reactive to editor changes
  void editorUpdateCounter.value;
  return editor?.value?.storage.characterCount?.words() ?? 0;
});

// Token counter menu
const showTokenMenu = ref(false);

// Editor update handler
const onEditorUpdate = () => {
  editorUpdateCounter.value++;
  const ed = editor?.value;
  if (ed && typeof ed.getHTML === 'function') {
    // Convert HTML to Markdown for accurate token counting
    const markdown = htmlToMarkdown(ed.getHTML());
    updateText(markdown);
  }
};

// Watch for editor instance changes
watch(
  () => editor?.value,
  (newEditor, oldEditor) => {
    // Remove listener from old editor
    if (oldEditor) {
      oldEditor.off('update', onEditorUpdate);
    }
    // Add listener to new editor
    if (newEditor) {
      newEditor.on('update', onEditorUpdate);
      // Trigger initial update
      editorUpdateCounter.value++;
      const markdown = htmlToMarkdown(newEditor.getHTML());
      updateText(markdown);
    }
  },
  { immediate: true }
);

// Cleanup on unmount
onUnmounted(() => {
  if (editor?.value) {
    editor.value.off('update', onEditorUpdate);
  }
});

// Heading control
const currentHeadingLevel = computed(() => {
  if (!editor?.value) return 0;
  for (let i = 1; i <= 6; i++) {
    if (editor.value.isActive("heading", { level: i })) return i;
  }
  return 0;
});

const setHeading = (level: number) => {
  if (level === 0) {
    runCommand((e) => e.chain().focus().setParagraph().run());
  } else {
    // Use setHeading (not toggle) to properly convert selected text to heading
    runCommand((e) => e.chain().focus().setHeading({ level: level as 1|2|3|4|5|6 }).run());
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
  const previousUrl = editor?.value?.getAttributes("customLink").href;
  const url = window.prompt(t.value.linkPrompt, previousUrl);
  if (url === null) return;
  if (url === "") {
    runCommand((e) => e.chain().focus().unsetLink().run());
  } else {
    runCommand((e) => e.chain().focus().setLink({ href: url }).run());
  }
};

const insertImage = () => {
  const url = window.prompt(t.value.imagePrompt);
  if (url) {
    runCommand((e) => e.chain().focus().setImage({ src: url }).run());
  }
};

// Mermaid diagram
const insertMermaid = () => {
  runCommand((e) => (e.commands as any).insertMermaid());
};

// Close dropdowns when clicking outside
const closeDropdowns = () => {
  showTableMenu.value = false;
  showTokenMenu.value = false;
};

const props = defineProps<{
  codeView?: boolean;
  isSplitActive?: boolean;
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  saveFile: [];
  saveFileAs: [];
  exportPdf: [];
  toggleCodeView: [];
  toggleSplit: [];
}>();
</script>

<template>
  <div class="toolbar" @click.self="closeDropdowns">
    <div class="toolbar-row">
      <!-- File operations -->
      <div class="toolbar-group">
        <button @click="emit('newFile')" class="toolbar-btn" :title="`${t.new} (Ctrl+N)`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
          <span>{{ t.new }}</span>
        </button>
        <button @click="emit('openFile')" class="toolbar-btn" :title="`${t.open} (Ctrl+O)`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
            <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
          </svg>
          <span>{{ t.open }}</span>
        </button>
        <button @click="emit('saveFile')" class="toolbar-btn" :title="`${t.save} (Ctrl+S)`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
          <span>{{ t.save }}</span>
        </button>
        <button @click="emit('saveFileAs')" class="toolbar-btn" :title="`${t.saveAs} (Ctrl+Shift+S)`">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="14,3 14,8 19,8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span>{{ t.saveAs }}</span>
        </button>
        <button @click="emit('exportPdf')" class="toolbar-btn" :title="t.exportPdf">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <path d="M12 18v-6"/>
            <path d="M9 15l3 3 3-3"/>
          </svg>
          <span>{{ t.exportPdf }}</span>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Undo/Redo -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().undo().run())"
          class="toolbar-btn icon-only"
          :title="`${t.undo} (Ctrl+Z)`"
          :disabled="!editor?.can().undo()"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 10h6"/>
            <path d="M3 10l4-4"/>
            <path d="M3 10l4 4"/>
            <path d="M9 10a7 7 0 1 1 0 8"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().redo().run())"
          class="toolbar-btn icon-only"
          :title="`${t.redo} (Ctrl+Y)`"
          :disabled="!editor?.can().redo()"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10h-6"/>
            <path d="M21 10l-4-4"/>
            <path d="M21 10l-4 4"/>
            <path d="M15 10a7 7 0 1 0 0 8"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Headings -->
      <div class="toolbar-group">
        <select
          id="heading-level-select"
          :value="currentHeadingLevel"
          @change="(e: Event) => setHeading(parseInt((e.target as HTMLSelectElement).value))"
          class="heading-select"
          :title="t.heading"
        >
          <option value="0">{{ t.paragraph }}</option>
          <option value="1">{{ t.headingLevel(1) }}</option>
          <option value="2">{{ t.headingLevel(2) }}</option>
          <option value="3">{{ t.headingLevel(3) }}</option>
          <option value="4">{{ t.headingLevel(4) }}</option>
          <option value="5">{{ t.headingLevel(5) }}</option>
          <option value="6">{{ t.headingLevel(6) }}</option>
        </select>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Text formatting (Markdown supported) -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().toggleBold().run())"
          :class="{ active: isActive('bold') }"
          class="toolbar-btn icon-only"
          :title="t.boldTooltip"
        >
          <strong>{{ t.bold }}</strong>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleItalic().run())"
          :class="{ active: isActive('italic') }"
          class="toolbar-btn icon-only"
          :title="t.italicTooltip"
        >
          <em>{{ t.italic }}</em>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleStrike().run())"
          :class="{ active: isActive('strike') }"
          class="toolbar-btn icon-only"
          :title="t.strikethroughTooltip"
        >
          <s>{{ t.strikethrough }}</s>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleCode().run())"
          :class="{ active: isActive('code') }"
          class="toolbar-btn icon-only"
          :title="t.inlineCodeTooltip"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16,18 22,12 16,6"/>
            <polyline points="8,6 2,12 8,18"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Lists -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().toggleBulletList().run())"
          :class="{ active: isActive('bulletList') }"
          class="toolbar-btn icon-only"
          :title="t.bulletList"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="9" y1="6" x2="20" y2="6"/>
            <line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <circle cx="4" cy="6" r="2" fill="currentColor"/>
            <circle cx="4" cy="12" r="2" fill="currentColor"/>
            <circle cx="4" cy="18" r="2" fill="currentColor"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleOrderedList().run())"
          :class="{ active: isActive('orderedList') }"
          class="toolbar-btn icon-only"
          :title="t.orderedList"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <!-- Number 1 -->
            <path d="M4.5 5V7.5M3.8 7.5H5.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            <!-- Number 2 -->
            <path d="M3.2 10.8C3.2 10.4 3.6 10 4.3 10C5 10 5.4 10.4 5.4 10.8C5.4 11.2 5 11.6 3.2 13.5H5.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <!-- Number 3 -->
            <path d="M3.2 16.3C3.2 16 3.6 15.6 4.3 15.6C5 15.6 5.4 16 5.4 16.3C5.4 16.6 5 17 4.3 17C5 17 5.4 17.4 5.4 17.7C5.4 18 5 18.4 4.3 18.4C3.6 18.4 3.2 18 3.2 17.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleTaskList().run())"
          :class="{ active: isActive('taskList') }"
          class="toolbar-btn icon-only"
          :title="t.taskList"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="5" width="6" height="6" rx="1"/>
            <path d="M5 8l1.5 1.5L9 7"/>
            <line x1="12" y1="8" x2="21" y2="8"/>
            <rect x="3" y="13" width="6" height="6" rx="1"/>
            <line x1="12" y1="16" x2="21" y2="16"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Block elements -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().toggleBlockquote().run())"
          :class="{ active: isActive('blockquote') }"
          class="toolbar-btn icon-only"
          :title="t.blockquote"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 11l-4 4V7a2 2 0 012-2h2"/>
            <path d="M20 11l-4 4V7a2 2 0 012-2h2"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleCodeBlock().run())"
          :class="{ active: isActive('codeBlock') }"
          class="toolbar-btn icon-only"
          :title="t.codeBlock"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <polyline points="9,9 6,12 9,15"/>
            <polyline points="15,9 18,12 15,15"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().setHorizontalRule().run())"
          class="toolbar-btn icon-only"
          :title="t.horizontalRule"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="3" y1="12" x2="21" y2="12"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Links & Images -->
      <div class="toolbar-group">
        <button
          @click="setLink"
          :class="{ active: isActive('customLink') }"
          class="toolbar-btn icon-only"
          :title="t.link"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
        </button>
        <button @click="insertImage" class="toolbar-btn icon-only" :title="t.image">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Table -->
      <div class="toolbar-group dropdown-container">
        <button
          @click="showTableMenu = !showTableMenu"
          :class="{ active: isActive('table') }"
          class="toolbar-btn icon-only"
          :title="t.table"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="3" y1="15" x2="21" y2="15"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
        <div v-if="showTableMenu" class="dropdown-menu">
          <button @click="insertTable" class="dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            {{ t.insertTable }}
          </button>
          <div class="dropdown-divider"></div>
          <button @click="addRowBefore" class="dropdown-item" :disabled="!isActive('table')">{{ t.addRowAbove }}</button>
          <button @click="addRowAfter" class="dropdown-item" :disabled="!isActive('table')">{{ t.addRowBelow }}</button>
          <button @click="addColumnBefore" class="dropdown-item" :disabled="!isActive('table')">{{ t.addColumnBefore }}</button>
          <button @click="addColumnAfter" class="dropdown-item" :disabled="!isActive('table')">{{ t.addColumnAfter }}</button>
          <div class="dropdown-divider"></div>
          <button @click="deleteRow" class="dropdown-item danger" :disabled="!isActive('table')">{{ t.deleteRow }}</button>
          <button @click="deleteColumn" class="dropdown-item danger" :disabled="!isActive('table')">{{ t.deleteColumn }}</button>
          <button @click="deleteTable" class="dropdown-item danger" :disabled="!isActive('table')">{{ t.deleteTable }}</button>
        </div>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Mermaid -->
      <div class="toolbar-group">
        <button @click="insertMermaid" class="toolbar-btn mermaid-btn" :title="t.insertMermaid">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="6" height="6" rx="1"/>
            <rect x="15" y="3" width="6" height="6" rx="1"/>
            <rect x="9" y="15" width="6" height="6" rx="1"/>
            <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/>
            <line x1="12" y1="12" x2="12" y2="15"/>
          </svg>
          <span>{{ t.mermaid }}</span>
        </button>
      </div>

      <!-- Spacer & Stats -->
      <div class="toolbar-spacer"></div>
      <div class="stats-display">
        <span>{{ characterCount }} {{ t.characters }}</span>
        <span class="separator">|</span>
        <span>{{ wordCount }} {{ t.words }}</span>
        <template v-if="showTokens">
          <span class="separator">|</span>
          <div class="token-counter dropdown-container">
            <button
              class="token-btn"
              @click.stop="showTokenMenu = !showTokenMenu"
              :title="t.tokensTooltip"
            >
              <span class="token-count">~{{ tokenCount }}</span>
              <span class="token-label">{{ t.tokens }}</span>
              <span class="token-model">({{ modelName }})</span>
              <svg class="token-chevron" :class="{ open: showTokenMenu }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div v-if="showTokenMenu" class="dropdown-menu token-menu">
              <button
                v-for="model in availableModels"
                :key="model.id"
                @click="changeModel(model.id); showTokenMenu = false"
                class="dropdown-item"
                :class="{ active: currentModel === model.id }"
              >
                <svg v-if="currentModel === model.id" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <span v-else style="width: 16px; display: inline-block;"></span>
                {{ model.name }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Code View Toggle -->
      <button
        @click="emit('toggleCodeView')"
        :class="{ active: props.codeView }"
        class="toolbar-btn code-toggle-btn"
        :title="props.codeView ? t.visualView : t.codeView"
      >
        <svg v-if="!props.codeView" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16,18 22,12 16,6"/>
          <polyline points="8,6 2,12 8,18"/>
          <line x1="14" y1="4" x2="10" y2="20"/>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span>{{ props.codeView ? t.visualView : t.codeView }}</span>
      </button>

      <!-- Split View Toggle -->
      <button
        @click="emit('toggleSplit')"
        :class="{ active: props.isSplitActive }"
        class="toolbar-btn split-toggle-btn"
        :title="props.isSplitActive ? t.singleView : t.splitView"
        :disabled="props.codeView"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="12" y1="3" x2="12" y2="21"/>
        </svg>
        <span>{{ props.isSplitActive ? t.singleView : t.splitView }}</span>
      </button>

      <div class="toolbar-separator"></div>

      <!-- Auto-save Toggle -->
      <div class="toolbar-group autosave-group">
        <span class="autosave-label">{{ t.autoSave }}:</span>
        <div class="radio-group">
          <label class="radio-option" :class="{ active: !settings.autoSave }">
            <input
              type="radio"
              name="autosave"
              :value="false"
              :checked="!settings.autoSave"
              @change="toggleAutoSave"
            />
            <span>{{ t.autoSaveOff }}</span>
          </label>
          <label class="radio-option" :class="{ active: settings.autoSave }">
            <input
              type="radio"
              name="autosave"
              :value="true"
              :checked="settings.autoSave"
              @change="toggleAutoSave"
            />
            <span>{{ t.autoSaveOn }}</span>
          </label>
        </div>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Language Toggle -->
      <button
        @click="toggleLocale"
        class="toolbar-btn lang-btn"
        :title="locale === 'en' ? 'Switch to Polish' : 'Przełącz na angielski'"
      >
        <span class="lang-flag">{{ locale === 'en' ? '🇬🇧' : '🇵🇱' }}</span>
        <span class="lang-code">{{ locale.toUpperCase() }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  background: linear-gradient(to bottom, #ffffff, #f8fafc);
  border-bottom: 1px solid #e2e8f0;
  padding: 8px 16px;
  user-select: none;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.toolbar-separator {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
  margin: 0 8px;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.toolbar-btn.icon-only {
  padding: 6px 8px;
}

.toolbar-btn:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #e2e8f0;
  color: #1e293b;
}

.toolbar-btn.active {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1d4ed8;
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn strong {
  font-weight: 700;
  font-size: 14px;
}

.toolbar-btn em {
  font-style: italic;
  font-size: 14px;
}

.toolbar-btn s {
  text-decoration: line-through;
  font-size: 14px;
}

.mermaid-btn {
  background: #ecfdf5;
  border-color: #a7f3d0;
  color: #047857;
}

.mermaid-btn:hover {
  background: #d1fae5;
  border-color: #6ee7b7;
}

.code-toggle-btn {
  background: #f0f9ff;
  border-color: #bae6fd;
  color: #0369a1;
}

.code-toggle-btn:hover {
  background: #e0f2fe;
  border-color: #7dd3fc;
}

.code-toggle-btn.active {
  background: #0ea5e9;
  border-color: #0284c7;
  color: white;
}

.split-toggle-btn {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #b45309;
}

.split-toggle-btn:hover:not(:disabled) {
  background: #fde68a;
  border-color: #fbbf24;
}

.split-toggle-btn.active {
  background: #f59e0b;
  border-color: #d97706;
  color: white;
}

.split-toggle-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.heading-select {
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  min-width: 130px;
}

.heading-select:hover {
  border-color: #cbd5e1;
}

.heading-select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

/* Dropdown */
.dropdown-container {
  position: relative;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  min-width: 180px;
  padding: 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: 4px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  text-align: left;
}

.dropdown-item:hover:not(:disabled) {
  background: #f1f5f9;
  color: #1e293b;
}

.dropdown-item:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dropdown-item.danger {
  color: #dc2626;
}

.dropdown-item.danger:hover:not(:disabled) {
  background: #fef2f2;
}

.dropdown-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 4px 0;
}

/* Stats */
.stats-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
  padding: 0 8px;
}

.stats-display .separator {
  color: #cbd5e1;
}

/* Language Toggle */
.lang-btn {
  gap: 4px;
  padding: 4px 8px !important;
  font-size: 12px;
  min-width: auto;
}

.lang-flag {
  font-size: 14px;
}

.lang-code {
  font-weight: 600;
  color: #64748b;
}

.lang-btn:hover .lang-code {
  color: #1e293b;
}

/* Auto-save Toggle */
.autosave-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.autosave-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.radio-group {
  display: flex;
  background: #f1f5f9;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.radio-option {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #64748b;
  transition: all 0.15s;
}

.radio-option input {
  display: none;
}

.radio-option:hover {
  color: #475569;
}

.radio-option.active {
  background: #ffffff;
  color: #1e293b;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

/* Token Counter */
.token-counter {
  display: inline-flex;
  position: relative;
}

.token-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #94a3b8;
  transition: all 0.15s;
}

.token-btn:hover {
  background: #f1f5f9;
  color: #64748b;
}

.token-count {
  color: #8b5cf6;
  font-weight: 500;
}

.token-label {
  color: inherit;
}

.token-model {
  color: #a1a1aa;
  font-size: 11px;
}

.token-chevron {
  transition: transform 0.2s;
  margin-left: 2px;
}

.token-chevron.open {
  transform: rotate(180deg);
}

.token-menu {
  right: 0;
  left: auto;
  min-width: 140px;
}

.token-menu .dropdown-item {
  font-size: 12px;
  padding: 6px 10px;
}

.token-menu .dropdown-item.active {
  background: #f0fdf4;
  color: #16a34a;
}
</style>
