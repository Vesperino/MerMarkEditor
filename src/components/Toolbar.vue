<script setup lang="ts">
import { inject, type ShallowRef } from "vue";
import type { Editor } from "@tiptap/vue-3";

const editor = inject<ShallowRef<Editor | undefined>>("editor");

const isActive = (name: string, attrs?: Record<string, unknown>) => {
  return editor?.value?.isActive(name, attrs) ?? false;
};

const runCommand = (callback: (e: Editor) => void) => {
  if (editor?.value) {
    callback(editor.value);
    editor.value.commands.focus();
  }
};

const setHeading = (level: number) => {
  if (level === 0) {
    runCommand((e) => e.chain().focus().setParagraph().run());
  } else {
    runCommand((e) => e.chain().focus().toggleHeading({ level: level as 1|2|3|4|5|6 }).run());
  }
};

const insertTable = () => {
  runCommand((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run());
};

const setLink = () => {
  const url = window.prompt("URL linku:");
  if (url) {
    runCommand((e) => e.chain().focus().setLink({ href: url }).run());
  }
};

const insertImage = () => {
  const url = window.prompt("URL obrazka:");
  if (url) {
    runCommand((e) => e.chain().focus().setImage({ src: url }).run());
  }
};

const insertMermaid = () => {
  runCommand((e) => (e.commands as any).insertMermaid());
};

const emit = defineEmits<{
  openFile: [];
  saveFile: [];
  exportPdf: [];
}>();
</script>

<template>
  <div class="toolbar">
    <!-- File operations -->
    <div class="toolbar-group file-group">
      <button @click="emit('openFile')" class="toolbar-btn" title="Otwórz (Ctrl+O)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
          <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
        </svg>
      </button>
      <button @click="emit('saveFile')" class="toolbar-btn" title="Zapisz (Ctrl+S)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
          <polyline points="17,21 17,13 7,13 7,21"/>
          <polyline points="7,3 7,8 15,8"/>
        </svg>
      </button>
      <button @click="emit('exportPdf')" class="toolbar-btn" title="Eksportuj do PDF">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <path d="M9 15h6"/>
          <path d="M12 12v6"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Text formatting -->
    <div class="toolbar-group">
      <button
        @click="runCommand(e => e.chain().focus().toggleBold().run())"
        :class="{ active: isActive('bold') }"
        class="toolbar-btn"
        title="Pogrubienie (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleItalic().run())"
        :class="{ active: isActive('italic') }"
        class="toolbar-btn"
        title="Kursywa (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleUnderline().run())"
        :class="{ active: isActive('underline') }"
        class="toolbar-btn"
        title="Podkreślenie (Ctrl+U)"
      >
        <u>U</u>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleStrike().run())"
        :class="{ active: isActive('strike') }"
        class="toolbar-btn"
        title="Przekreślenie"
      >
        <s>S</s>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleHighlight().run())"
        :class="{ active: isActive('highlight') }"
        class="toolbar-btn highlight-btn"
        title="Zaznaczenie"
      >
        <span class="highlight-icon">H</span>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Headings -->
    <div class="toolbar-group">
      <select @change="(e: Event) => setHeading(parseInt((e.target as HTMLSelectElement).value))" class="heading-select">
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

    <!-- Alignment -->
    <div class="toolbar-group">
      <button
        @click="runCommand(e => e.chain().focus().setTextAlign('left').run())"
        :class="{ active: isActive({ textAlign: 'left' }) }"
        class="toolbar-btn"
        title="Wyrównaj do lewej"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().setTextAlign('center').run())"
        :class="{ active: isActive({ textAlign: 'center' }) }"
        class="toolbar-btn"
        title="Wyśrodkuj"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().setTextAlign('right').run())"
        :class="{ active: isActive({ textAlign: 'right' }) }"
        class="toolbar-btn"
        title="Wyrównaj do prawej"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Lists -->
    <div class="toolbar-group">
      <button
        @click="runCommand(e => e.chain().focus().toggleBulletList().run())"
        :class="{ active: isActive('bulletList') }"
        class="toolbar-btn"
        title="Lista punktowana"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
          <circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="12" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleOrderedList().run())"
        :class="{ active: isActive('orderedList') }"
        class="toolbar-btn"
        title="Lista numerowana"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/>
          <text x="3" y="8" font-size="6" fill="currentColor">1</text>
          <text x="3" y="14" font-size="6" fill="currentColor">2</text>
          <text x="3" y="20" font-size="6" fill="currentColor">3</text>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleTaskList().run())"
        :class="{ active: isActive('taskList') }"
        class="toolbar-btn"
        title="Lista zadań"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
        class="toolbar-btn"
        title="Cytat"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 11l-4 4V7a2 2 0 012-2h2"/>
          <path d="M20 11l-4 4V7a2 2 0 012-2h2"/>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().toggleCodeBlock().run())"
        :class="{ active: isActive('codeBlock') }"
        class="toolbar-btn"
        title="Blok kodu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16,18 22,12 16,6"/>
          <polyline points="8,6 2,12 8,18"/>
        </svg>
      </button>
      <button
        @click="runCommand(e => e.chain().focus().setHorizontalRule().run())"
        class="toolbar-btn"
        title="Linia pozioma"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"/>
        </svg>
      </button>
    </div>

    <div class="toolbar-separator"></div>

    <!-- Insert -->
    <div class="toolbar-group">
      <button @click="setLink" class="toolbar-btn" title="Wstaw link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      </button>
      <button @click="insertImage" class="toolbar-btn" title="Wstaw obrazek">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      </button>
      <button @click="insertTable" class="toolbar-btn" title="Wstaw tabelę">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="3" y1="15" x2="21" y2="15"/>
          <line x1="9" y1="3" x2="9" y2="21"/>
          <line x1="15" y1="3" x2="15" y2="21"/>
        </svg>
      </button>
      <button @click="insertMermaid" class="toolbar-btn mermaid-btn" title="Wstaw diagram Mermaid">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="6" height="6" rx="1"/>
          <rect x="15" y="3" width="6" height="6" rx="1"/>
          <rect x="9" y="15" width="6" height="6" rx="1"/>
          <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9"/>
          <line x1="12" y1="12" x2="12" y2="15"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 6px 16px;
  background: linear-gradient(to bottom, #f8fafc, #f1f5f9);
  border-bottom: 1px solid var(--border-color);
  gap: 4px;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.file-group {
  margin-right: 8px;
}

.toolbar-separator {
  width: 1px;
  height: 24px;
  background: #cbd5e1;
  margin: 0 6px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  color: #475569;
  font-size: 14px;
  transition: all 0.15s;
}

.toolbar-btn:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.toolbar-btn.active {
  background: #dbeafe;
  color: #2563eb;
}

.toolbar-btn strong {
  font-weight: 700;
}

.toolbar-btn em {
  font-style: italic;
}

.toolbar-btn u {
  text-decoration: underline;
}

.toolbar-btn s {
  text-decoration: line-through;
}

.highlight-btn .highlight-icon {
  background: #fef08a;
  padding: 2px 6px;
  border-radius: 2px;
  font-weight: 600;
}

.mermaid-btn {
  background: #f0fdf4;
  border: 1px solid #86efac;
}

.mermaid-btn:hover {
  background: #dcfce7;
}

.heading-select {
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  min-width: 120px;
}

.heading-select:hover {
  border-color: #cbd5e1;
}

.heading-select:focus {
  outline: none;
  border-color: #2563eb;
}
</style>
