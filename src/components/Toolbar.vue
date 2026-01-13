<script setup lang="ts">
import { inject, ref, computed, type Ref } from "vue";
import type { Editor } from "@tiptap/vue-3";
import { useI18n } from "../i18n";

const { t, locale, toggleLocale } = useI18n();
const editor = inject<Ref<Editor | null>>("editor");

const showTableMenu = ref(false);

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

// Character count
const characterCount = computed(() => {
  return editor?.value?.storage.characterCount?.characters() ?? 0;
});

const wordCount = computed(() => {
  return editor?.value?.storage.characterCount?.words() ?? 0;
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
  const previousUrl = editor?.value?.getAttributes("link").href;
  const url = window.prompt("URL linku:", previousUrl);
  if (url === null) return;
  if (url === "") {
    runCommand((e) => e.chain().focus().unsetLink().run());
  } else {
    runCommand((e) => e.chain().focus().setLink({ href: url }).run());
  }
};

const insertImage = () => {
  const url = window.prompt("URL obrazka:");
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
};

const emit = defineEmits<{
  openFile: [];
  saveFile: [];
  saveFileAs: [];
  exportPdf: [];
}>();
</script>

<template>
  <div class="toolbar" @click.self="closeDropdowns">
    <div class="toolbar-row">
      <!-- File operations -->
      <div class="toolbar-group">
        <button @click="emit('openFile')" class="toolbar-btn" title="Otwórz plik Markdown (Ctrl+O)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
            <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
          </svg>
          <span>Otwórz</span>
        </button>
        <button @click="emit('saveFile')" class="toolbar-btn" title="Zapisz jako Markdown (Ctrl+S)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
          <span>Zapisz</span>
        </button>
        <button @click="emit('saveFileAs')" class="toolbar-btn" title="Zapisz jako nowy plik (Ctrl+Shift+S)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/>
            <polyline points="14,3 14,8 19,8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
          <span>Zapisz jako</span>
        </button>
        <button @click="emit('exportPdf')" class="toolbar-btn" title="Eksportuj do PDF">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <path d="M12 18v-6"/>
            <path d="M9 15l3 3 3-3"/>
          </svg>
          <span>PDF</span>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Undo/Redo -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().undo().run())"
          class="toolbar-btn icon-only"
          title="Cofnij (Ctrl+Z)"
          :disabled="!editor?.can().undo()"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 7v6h6"/>
            <path d="M3 13a9 9 0 1 0 3-7.5"/>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().redo().run())"
          class="toolbar-btn icon-only"
          title="Ponów (Ctrl+Y)"
          :disabled="!editor?.can().redo()"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 7v6h-6"/>
            <path d="M21 13a9 9 0 1 1-3-7.5"/>
          </svg>
        </button>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Headings -->
      <div class="toolbar-group">
        <select
          :value="currentHeadingLevel"
          @change="(e: Event) => setHeading(parseInt((e.target as HTMLSelectElement).value))"
          class="heading-select"
          title="Styl tekstu"
        >
          <option value="0">Paragraf</option>
          <option value="1">Nagłówek 1</option>
          <option value="2">Nagłówek 2</option>
          <option value="3">Nagłówek 3</option>
          <option value="4">Nagłówek 4</option>
          <option value="5">Nagłówek 5</option>
          <option value="6">Nagłówek 6</option>
        </select>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Text formatting (Markdown supported) -->
      <div class="toolbar-group">
        <button
          @click="runCommand(e => e.chain().focus().toggleBold().run())"
          :class="{ active: isActive('bold') }"
          class="toolbar-btn icon-only"
          title="Pogrubienie **tekst** (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleItalic().run())"
          :class="{ active: isActive('italic') }"
          class="toolbar-btn icon-only"
          title="Kursywa *tekst* (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleStrike().run())"
          :class="{ active: isActive('strike') }"
          class="toolbar-btn icon-only"
          title="Przekreślenie ~~tekst~~"
        >
          <s>S</s>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleCode().run())"
          :class="{ active: isActive('code') }"
          class="toolbar-btn icon-only"
          title="Kod inline `kod`"
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
          title="Lista punktowana - element"
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
          title="Lista numerowana 1. element"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="10" y1="6" x2="20" y2="6"/>
            <line x1="10" y1="12" x2="20" y2="12"/>
            <line x1="10" y1="18" x2="20" y2="18"/>
            <text x="2" y="8" font-size="8" fill="currentColor" font-weight="bold">1</text>
            <text x="2" y="14" font-size="8" fill="currentColor" font-weight="bold">2</text>
            <text x="2" y="20" font-size="8" fill="currentColor" font-weight="bold">3</text>
          </svg>
        </button>
        <button
          @click="runCommand(e => e.chain().focus().toggleTaskList().run())"
          :class="{ active: isActive('taskList') }"
          class="toolbar-btn icon-only"
          title="Lista zadań - [x] zadanie"
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
          title="Cytat > tekst"
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
          title="Blok kodu ```kod```"
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
          title="Linia pozioma ---"
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
          :class="{ active: isActive('link') }"
          class="toolbar-btn icon-only"
          title="Link [tekst](url)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
          </svg>
        </button>
        <button @click="insertImage" class="toolbar-btn icon-only" title="Obrazek ![alt](url)">
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
          title="Tabela Markdown"
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
            Wstaw tabelę
          </button>
          <div class="dropdown-divider"></div>
          <button @click="addRowBefore" class="dropdown-item" :disabled="!isActive('table')">Dodaj wiersz powyżej</button>
          <button @click="addRowAfter" class="dropdown-item" :disabled="!isActive('table')">Dodaj wiersz poniżej</button>
          <button @click="addColumnBefore" class="dropdown-item" :disabled="!isActive('table')">Dodaj kolumnę przed</button>
          <button @click="addColumnAfter" class="dropdown-item" :disabled="!isActive('table')">Dodaj kolumnę po</button>
          <div class="dropdown-divider"></div>
          <button @click="deleteRow" class="dropdown-item danger" :disabled="!isActive('table')">Usuń wiersz</button>
          <button @click="deleteColumn" class="dropdown-item danger" :disabled="!isActive('table')">Usuń kolumnę</button>
          <button @click="deleteTable" class="dropdown-item danger" :disabled="!isActive('table')">Usuń tabelę</button>
        </div>
      </div>

      <div class="toolbar-separator"></div>

      <!-- Mermaid -->
      <div class="toolbar-group">
        <button @click="insertMermaid" class="toolbar-btn mermaid-btn" title="Wstaw diagram Mermaid">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="6" height="6" rx="1"/>
            <rect x="15" y="3" width="6" height="6" rx="1"/>
            <rect x="9" y="15" width="6" height="6" rx="1"/>
            <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/>
            <line x1="12" y1="12" x2="12" y2="15"/>
          </svg>
          <span>Mermaid</span>
        </button>
      </div>

      <!-- Spacer & Stats -->
      <div class="toolbar-spacer"></div>
      <div class="stats-display">
        <span>{{ characterCount }} {{ t.characters }}</span>
        <span class="separator">|</span>
        <span>{{ wordCount }} {{ t.words }}</span>
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
</style>
