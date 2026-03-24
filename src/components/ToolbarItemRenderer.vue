<script setup lang="ts">
import { useToolbarActions } from '../composables/useToolbarActions';

const props = defineProps<{
  itemId: string;
  compact?: boolean;
  vertical?: boolean;
  codeView?: boolean;
  isSplitActive?: boolean;
  diffActive?: boolean;
  canShowDiff?: boolean;
  canCompareTabs?: boolean;
  tocActive?: boolean;
  dropdownDirection?: 'down' | 'up' | 'right';
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  saveFile: [];
  saveFileAs: [];
  exportPdf: [];
  toggleCodeView: [];
  toggleSplit: [];
  toggleDiffPreview: [];
  compareTabs: [];
  showShortcuts: [];
  showSettings: [];
  toggleToc: [];
}>();

const {
  isActive,
  runCommand,
  characterCount,
  wordCount,
  tokenCount,
  modelName,
  showTokens,
  currentModel,
  availableModels,
  changeModel,
  zoomPercent,
  zoomIn,
  zoomOut,
  resetZoom,
  currentHeadingLevel,
  setHeading,
  showTableMenu,
  insertTable,
  addRowBefore,
  addRowAfter,
  addColumnBefore,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
  showImageMenu,
  setLink,
  insertImageFromUrl,
  insertImageFromFile,
  showTokenMenu,
  insertMermaid,
  editor,
  t,
} = useToolbarActions();

const needsEditor = (id: string) => {
  const editorItems = [
    'undo', 'redo', 'heading-select', 'bold', 'italic', 'strikethrough', 'inline-code',
    'bullet-list', 'ordered-list', 'task-list', 'blockquote', 'code-block', 'horizontal-rule',
    'link', 'image', 'table', 'mermaid',
  ];
  return editorItems.includes(id);
};

const isDisabled = (id: string) => {
  if (needsEditor(id) && props.codeView) return true;
  if (id === 'undo') return !editor?.value?.can().undo();
  if (id === 'redo') return !editor?.value?.can().redo();
  if (id === 'toggle-toc') return !!props.codeView;
  if (id === 'toggle-split-view') return !!props.codeView;
  if (id === 'toggle-diff') return !props.canShowDiff || !!props.codeView;
  if (id === 'compare-tabs') return !props.canCompareTabs || !!props.codeView;
  return false;
};

const showLabel = (id: string) => {
  if (props.compact || props.vertical) return false;
  // Items that always show labels (not icon-only)
  const labelItems = [
    'new-file', 'open-file', 'save-file', 'save-file-as', 'export-pdf',
    'mermaid', 'toggle-toc', 'toggle-code-view', 'toggle-split-view',
    'toggle-diff', 'compare-tabs',
  ];
  return labelItems.includes(id);
};
</script>

<template>
  <!-- File operations -->
  <button v-if="itemId === 'new-file'" @click="emit('newFile')" class="toolbar-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="`${t.new} (Ctrl+N)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="12" y1="11" x2="12" y2="17"/>
      <line x1="9" y1="14" x2="15" y2="14"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.new }}</span>
  </button>

  <button v-else-if="itemId === 'open-file'" @click="emit('openFile')" class="toolbar-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="`${t.open} (Ctrl+O)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
      <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.open }}</span>
  </button>

  <button v-else-if="itemId === 'save-file'" @click="emit('saveFile')" class="toolbar-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="`${t.save} (Ctrl+S)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
      <polyline points="17,21 17,13 7,13 7,21"/>
      <polyline points="7,3 7,8 15,8"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.save }}</span>
  </button>

  <button v-else-if="itemId === 'save-file-as'" @click="emit('saveFileAs')" class="toolbar-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="`${t.saveAs} (Ctrl+Shift+S)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
      <polyline points="14,3 14,8 19,8"/>
      <line x1="12" y1="12" x2="12" y2="18"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.saveAs }}</span>
  </button>

  <button v-else-if="itemId === 'export-pdf'" @click="emit('exportPdf')" class="toolbar-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="t.exportPdf" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <path d="M12 18v-6"/>
      <path d="M9 15l3 3 3-3"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.exportPdf }}</span>
  </button>

  <button v-else-if="itemId === 'show-shortcuts'" @click="emit('showShortcuts')" class="toolbar-btn icon-only shortcuts-btn" :title="`${t.keyboardShortcuts} (Ctrl+/)`">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/>
      <line x1="6" y1="10" x2="6" y2="10"/>
      <line x1="10" y1="10" x2="10" y2="10"/>
      <line x1="14" y1="10" x2="14" y2="10"/>
      <line x1="18" y1="10" x2="18" y2="10"/>
      <line x1="8" y1="14" x2="16" y2="14"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'show-settings'" @click="emit('showSettings')" class="toolbar-btn icon-only settings-btn" :title="t.settings">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>

  <!-- Undo/Redo -->
  <button v-else-if="itemId === 'undo'" @click="runCommand(e => e.chain().focus().undo().run())" class="toolbar-btn icon-only" :title="`${t.undo} (Ctrl+Z)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 10h6"/>
      <path d="M3 10l4-4"/>
      <path d="M3 10l4 4"/>
      <path d="M9 10a7 7 0 1 1 0 8"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'redo'" @click="runCommand(e => e.chain().focus().redo().run())" class="toolbar-btn icon-only" :title="`${t.redo} (Ctrl+Y)`" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10h-6"/>
      <path d="M21 10l-4-4"/>
      <path d="M21 10l-4 4"/>
      <path d="M15 10a7 7 0 1 0 0 8"/>
    </svg>
  </button>

  <!-- Headings -->
  <div v-else-if="itemId === 'heading-select'" class="toolbar-group">
    <select
      id="heading-level-select"
      :value="currentHeadingLevel"
      @change="(e: Event) => setHeading(parseInt((e.target as HTMLSelectElement).value))"
      class="heading-select"
      :title="t.heading"
      :disabled="isDisabled(itemId)"
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

  <!-- Text formatting -->
  <button v-else-if="itemId === 'bold'" @click="runCommand(e => e.chain().focus().toggleBold().run())" :class="{ active: isActive('bold') }" class="toolbar-btn icon-only" :title="t.boldTooltip" :disabled="isDisabled(itemId)">
    <strong>{{ t.bold }}</strong>
  </button>

  <button v-else-if="itemId === 'italic'" @click="runCommand(e => e.chain().focus().toggleItalic().run())" :class="{ active: isActive('italic') }" class="toolbar-btn icon-only" :title="t.italicTooltip" :disabled="isDisabled(itemId)">
    <em>{{ t.italic }}</em>
  </button>

  <button v-else-if="itemId === 'strikethrough'" @click="runCommand(e => e.chain().focus().toggleStrike().run())" :class="{ active: isActive('strike') }" class="toolbar-btn icon-only" :title="t.strikethroughTooltip" :disabled="isDisabled(itemId)">
    <s>{{ t.strikethrough }}</s>
  </button>

  <button v-else-if="itemId === 'inline-code'" @click="runCommand(e => e.chain().focus().toggleCode().run())" :class="{ active: isActive('code') }" class="toolbar-btn icon-only" :title="t.inlineCodeTooltip" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="16,18 22,12 16,6"/>
      <polyline points="8,6 2,12 8,18"/>
    </svg>
  </button>

  <!-- Lists -->
  <button v-else-if="itemId === 'bullet-list'" @click="runCommand(e => e.chain().focus().toggleBulletList().run())" :class="{ active: isActive('bulletList') }" class="toolbar-btn icon-only" :title="t.bulletList" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="9" y1="6" x2="20" y2="6"/>
      <line x1="9" y1="12" x2="20" y2="12"/>
      <line x1="9" y1="18" x2="20" y2="18"/>
      <circle cx="4" cy="6" r="2" fill="currentColor"/>
      <circle cx="4" cy="12" r="2" fill="currentColor"/>
      <circle cx="4" cy="18" r="2" fill="currentColor"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'ordered-list'" @click="runCommand(e => e.chain().focus().toggleOrderedList().run())" :class="{ active: isActive('orderedList') }" class="toolbar-btn icon-only" :title="t.orderedList" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="10" y1="6" x2="21" y2="6"/>
      <line x1="10" y1="12" x2="21" y2="12"/>
      <line x1="10" y1="18" x2="21" y2="18"/>
      <path d="M4.5 5V7.5M3.8 7.5H5.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M3.2 10.8C3.2 10.4 3.6 10 4.3 10C5 10 5.4 10.4 5.4 10.8C5.4 11.2 5 11.6 3.2 13.5H5.4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <path d="M3.2 16.3C3.2 16 3.6 15.6 4.3 15.6C5 15.6 5.4 16 5.4 16.3C5.4 16.6 5 17 4.3 17C5 17 5.4 17.4 5.4 17.7C5.4 18 5 18.4 4.3 18.4C3.6 18.4 3.2 18 3.2 17.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'task-list'" @click="runCommand(e => e.chain().focus().toggleTaskList().run())" :class="{ active: isActive('taskList') }" class="toolbar-btn icon-only" :title="t.taskList" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="5" width="6" height="6" rx="1"/>
      <path d="M5 8l1.5 1.5L9 7"/>
      <line x1="12" y1="8" x2="21" y2="8"/>
      <rect x="3" y="13" width="6" height="6" rx="1"/>
      <line x1="12" y1="16" x2="21" y2="16"/>
    </svg>
  </button>

  <!-- Blocks -->
  <button v-else-if="itemId === 'blockquote'" @click="runCommand(e => e.chain().focus().toggleBlockquote().run())" :class="{ active: isActive('blockquote') }" class="toolbar-btn icon-only" :title="t.blockquote" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 11l-4 4V7a2 2 0 012-2h2"/>
      <path d="M20 11l-4 4V7a2 2 0 012-2h2"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'code-block'" @click="runCommand(e => e.chain().focus().toggleCodeBlock().run())" :class="{ active: isActive('codeBlock') }" class="toolbar-btn icon-only" :title="t.codeBlock" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <polyline points="9,9 6,12 9,15"/>
      <polyline points="15,9 18,12 15,15"/>
    </svg>
  </button>

  <button v-else-if="itemId === 'horizontal-rule'" @click="runCommand(e => e.chain().focus().setHorizontalRule().run())" class="toolbar-btn icon-only" :title="t.horizontalRule" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="3" y1="12" x2="21" y2="12"/>
    </svg>
  </button>

  <!-- Link -->
  <button v-else-if="itemId === 'link'" @click="setLink" :class="{ active: isActive('customLink') }" class="toolbar-btn icon-only" :title="t.link" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  </button>

  <!-- Image (with dropdown) -->
  <div v-else-if="itemId === 'image'" class="dropdown-container">
    <button @click="showImageMenu = !showImageMenu" class="toolbar-btn icon-only" :title="t.image" :disabled="isDisabled(itemId)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    </button>
    <div v-if="showImageMenu" class="dropdown-menu" :class="{ 'dropdown-up': dropdownDirection === 'up', 'dropdown-right': dropdownDirection === 'right' }">
      <button @click="insertImageFromUrl" class="dropdown-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
        {{ t.imageFromUrl }}
      </button>
      <button @click="insertImageFromFile" class="dropdown-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
          <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
        </svg>
        {{ t.imageFromFile }}
      </button>
    </div>
  </div>

  <!-- Table (with dropdown) -->
  <div v-else-if="itemId === 'table'" class="toolbar-group dropdown-container">
    <button @click="showTableMenu = !showTableMenu" :class="{ active: isActive('table') }" class="toolbar-btn icon-only" :title="t.table" :disabled="isDisabled(itemId)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="15" x2="21" y2="15"/>
        <line x1="9" y1="3" x2="9" y2="21"/>
        <line x1="15" y1="3" x2="15" y2="21"/>
      </svg>
    </button>
    <div v-if="showTableMenu" class="dropdown-menu" :class="{ 'dropdown-up': dropdownDirection === 'up', 'dropdown-right': dropdownDirection === 'right' }">
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

  <!-- Mermaid -->
  <button v-else-if="itemId === 'mermaid'" @click="insertMermaid" class="toolbar-btn mermaid-btn" :class="{ 'icon-only': !showLabel(itemId) }" :title="t.insertMermaid" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="6" height="6" rx="1"/>
      <rect x="15" y="3" width="6" height="6" rx="1"/>
      <rect x="9" y="15" width="6" height="6" rx="1"/>
      <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/>
      <line x1="12" y1="12" x2="12" y2="15"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.mermaid }}</span>
  </button>

  <!-- Stats: characters + words + tokens as one group -->
  <div v-else-if="itemId === 'stats'" class="stats-display">
    <span class="stats-item">{{ characterCount }} {{ t.characters }}</span>
    <span class="stats-sep">|</span>
    <span class="stats-item">{{ wordCount }} {{ t.words }}</span>
    <template v-if="showTokens">
      <span class="stats-sep">|</span>
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
        <div v-if="showTokenMenu" class="dropdown-menu token-menu" :class="{ 'dropdown-up': dropdownDirection === 'up', 'dropdown-right': dropdownDirection === 'right' }">
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

  <!-- Zoom controls -->
  <div v-else-if="itemId === 'zoom-controls'" class="toolbar-group zoom-group">
    <button @click="zoomOut" class="toolbar-btn icon-only" :title="t.zoomOut">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>
    <button @click="resetZoom" class="toolbar-btn zoom-percent-btn" :title="t.reset">
      {{ zoomPercent }}%
    </button>
    <button @click="zoomIn" class="toolbar-btn icon-only" :title="t.zoomIn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="11" y1="8" x2="11" y2="14"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
    </button>
  </div>

  <!-- View toggles -->
  <button v-else-if="itemId === 'toggle-toc'" @click="emit('toggleToc')" :class="['toolbar-btn', 'toc-toggle-btn', { active: tocActive, 'icon-only': !showLabel(itemId) }]" :title="t.tocTooltip" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <line x1="3" y1="6" x2="3" y2="6"/>
      <line x1="7" y1="6" x2="21" y2="6"/>
      <line x1="5" y1="12" x2="5" y2="12"/>
      <line x1="9" y1="12" x2="21" y2="12"/>
      <line x1="5" y1="18" x2="5" y2="18"/>
      <line x1="9" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="5" cy="18" r="1" fill="currentColor" stroke="none"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.tableOfContents }}</span>
  </button>

  <button v-else-if="itemId === 'toggle-code-view'" @click="emit('toggleCodeView')" :class="['toolbar-btn', 'code-toggle-btn', { active: codeView, 'icon-only': !showLabel(itemId) }]" :title="codeView ? t.visualView : t.codeView">
    <svg v-if="!codeView" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="16,18 22,12 16,6"/>
      <polyline points="8,6 2,12 8,18"/>
      <line x1="14" y1="4" x2="10" y2="20"/>
    </svg>
    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ codeView ? t.visualView : t.codeView }}</span>
  </button>

  <button v-else-if="itemId === 'toggle-split-view'" @click="emit('toggleSplit')" :class="['toolbar-btn', 'split-toggle-btn', { active: isSplitActive, 'icon-only': !showLabel(itemId) }]" :title="isSplitActive ? t.singleView : t.splitView" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="12" y1="3" x2="12" y2="21"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ isSplitActive ? t.singleView : t.splitView }}</span>
  </button>

  <button v-else-if="itemId === 'toggle-diff'" @click="emit('toggleDiffPreview')" :class="['toolbar-btn', 'changes-toggle-btn', { active: diffActive, 'icon-only': !showLabel(itemId) }]" :title="t.changes" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14,2 14,8 20,8"/>
      <line x1="9" y1="15" x2="15" y2="15"/>
      <line x1="12" y1="12" x2="12" y2="18"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.changes }}</span>
  </button>

  <button v-else-if="itemId === 'compare-tabs'" @click="emit('compareTabs')" :class="['toolbar-btn', 'compare-tabs-btn', { 'icon-only': !showLabel(itemId) }]" :title="t.compareTabsTooltip" :disabled="isDisabled(itemId)">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h4"/>
      <polyline points="14,2 14,8 20,8"/>
      <path d="M14 14H24a2 2 0 00-2-2h-4"/>
      <rect x="13" y="12" width="9" height="10" rx="2"/>
      <path d="M8 12h2"/>
      <path d="M8 16h1"/>
    </svg>
    <span v-if="showLabel(itemId)">{{ t.compareTabs }}</span>
  </button>
</template>

<style scoped>
/* Button styles inherited from toolbar context */
.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.toolbar-btn.icon-only {
  padding: 6px 8px;
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.toolbar-btn.active {
  background: var(--active-bg);
  border-color: var(--active-border);
  color: var(--active-text);
}

.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-btn strong { font-weight: 700; font-size: 14px; }
.toolbar-btn em { font-style: italic; font-size: 14px; }
.toolbar-btn s { text-decoration: line-through; font-size: 14px; }

/* Stats */
.stats-display {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-faint);
  padding: 0 8px;
}

.stats-item {
  white-space: nowrap;
}

.stats-sep {
  color: var(--border-secondary);
}

/* Special button styles */
.mermaid-btn { background: var(--mermaid-bg); border-color: var(--mermaid-border); color: var(--mermaid-color); }
.mermaid-btn:hover { background: var(--mermaid-hover-bg); border-color: var(--mermaid-hover-border); }

.shortcuts-btn { color: var(--text-muted); }
.shortcuts-btn:hover { color: var(--text-primary); }

.settings-btn { color: var(--text-muted); }
.settings-btn:hover { color: var(--text-primary); }

.toc-toggle-btn { background: var(--toc-toggle-bg); border-color: var(--toc-toggle-border); color: var(--toc-toggle-color); }
.toc-toggle-btn:hover:not(:disabled) { background: var(--toc-toggle-hover-bg); border-color: var(--toc-toggle-hover-border); }
.toc-toggle-btn.active { background: var(--toc-toggle-active-bg); border-color: var(--toc-toggle-active-border); color: white; }
.toc-toggle-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.code-toggle-btn { background: var(--code-toggle-bg); border-color: var(--code-toggle-border); color: var(--code-toggle-color); }
.code-toggle-btn:hover { background: var(--code-toggle-hover-bg); border-color: var(--code-toggle-hover-border); }
.code-toggle-btn.active { background: var(--code-toggle-active-bg); border-color: var(--code-toggle-active-border); color: white; }

.split-toggle-btn { background: var(--split-toggle-bg); border-color: var(--split-toggle-border); color: var(--split-toggle-color); }
.split-toggle-btn:hover:not(:disabled) { background: var(--split-toggle-hover-bg); border-color: var(--split-toggle-hover-border); }
.split-toggle-btn.active { background: var(--split-toggle-active-bg); border-color: var(--split-toggle-active-border); color: white; }
.split-toggle-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.changes-toggle-btn { background: var(--changes-toggle-bg); border-color: var(--changes-toggle-border); color: var(--changes-toggle-color); }
.changes-toggle-btn:hover:not(:disabled) { background: var(--changes-toggle-hover-bg); border-color: var(--changes-toggle-hover-border); }
.changes-toggle-btn.active { background: var(--changes-toggle-active-bg); border-color: var(--changes-toggle-active-border); color: white; }
.changes-toggle-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.compare-tabs-btn { background: var(--changes-toggle-bg); border-color: var(--changes-toggle-border); color: var(--changes-toggle-color); }
.compare-tabs-btn:hover:not(:disabled) { background: var(--changes-toggle-hover-bg); border-color: var(--changes-toggle-hover-border); }
.compare-tabs-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Heading select */
.heading-select {
  padding: 6px 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-input);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  min-width: 130px;
}
.heading-select:hover { border-color: var(--border-secondary); }
.heading-select:focus { outline: none; border-color: var(--focus-ring); box-shadow: 0 0 0 2px var(--focus-ring-alpha); }
.heading-select:disabled { opacity: 0.4; cursor: not-allowed; }

/* Dropdown */
.dropdown-container { position: relative; }

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
  z-index: 1000;
  min-width: 180px;
  padding: 4px;
}

.dropdown-menu.dropdown-up {
  top: auto;
  bottom: 100%;
  margin-top: 0;
  margin-bottom: 4px;
}

.dropdown-menu.dropdown-right {
  top: 0;
  left: 100%;
  margin-top: 0;
  margin-left: 4px;
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
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
}
.dropdown-item:hover:not(:disabled) { background: var(--hover-bg); color: var(--text-primary); }
.dropdown-item:disabled { opacity: 0.4; cursor: not-allowed; }
.dropdown-item.danger { color: var(--danger); }
.dropdown-item.danger:hover:not(:disabled) { background: var(--danger-text-bg); }

.dropdown-divider { height: 1px; background: var(--border-primary); margin: 4px 0; }

/* Token counter */
.token-counter { display: inline-flex; position: relative; }
.token-btn {
  display: flex; align-items: center; gap: 4px; padding: 2px 6px;
  border: none; background: transparent; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: var(--text-faint); transition: all 0.15s;
}
.token-btn:hover { background: var(--hover-bg); color: var(--text-muted); }
.token-count { color: var(--token-color); font-weight: 500; }
.token-label { color: inherit; }
.token-model { color: var(--token-model-color); font-size: 11px; }
.token-chevron { transition: transform 0.2s; margin-left: 2px; }
.token-chevron.open { transform: rotate(180deg); }
.token-menu { right: 0; left: auto; min-width: 140px; }
.token-menu .dropdown-item { font-size: 12px; padding: 6px 10px; }
.token-menu .dropdown-item.active { background: var(--token-active-bg); color: var(--token-active-color); }

/* Zoom */
.toolbar-group { display: flex; align-items: center; gap: 2px; }
.zoom-group { gap: 0; }
.zoom-percent-btn { font-size: 12px; font-weight: 500; min-width: 44px; padding: 4px 6px; justify-content: center; color: var(--text-muted); }
</style>
