<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3';
import { computed, ref, nextTick } from 'vue';
import { useI18n } from '../i18n';
import type { FootnoteDefinition } from '../utils/footnote-utils';

const { t } = useI18n();

const props = defineProps<{
  node: {
    attrs: {
      definitions: string;
    };
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  selected: boolean;
}>();

const defs = computed<FootnoteDefinition[]>(() => {
  try {
    return JSON.parse(props.node.attrs.definitions || '[]');
  } catch {
    return [];
  }
});

const editingIndex = ref<number | null>(null);
const editContent = ref('');

const startEdit = (index: number) => {
  editContent.value = defs.value[index].content;
  editingIndex.value = index;
  nextTick(() => {
    const el = document.querySelector(`.footnote-item[data-index="${index}"] .footnote-edit-input`) as HTMLTextAreaElement | null;
    el?.focus();
  });
};

const saveEdit = () => {
  if (editingIndex.value === null) return;
  const updated = [...defs.value];
  updated[editingIndex.value] = { ...updated[editingIndex.value], content: editContent.value };
  props.updateAttributes({ definitions: JSON.stringify(updated) });
  editingIndex.value = null;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saveEdit();
  } else if (e.key === 'Escape') {
    editingIndex.value = null;
  }
};

// Dispatch a bubbling DOM event so useFootnotes in Editor.vue can scroll to the ref.
const emitBacklink = (e: MouseEvent, label: string) => {
  e.stopPropagation();
  (e.currentTarget as HTMLElement).dispatchEvent(
    new CustomEvent('mermark-footnote-backlink', { detail: { label }, bubbles: true }),
  );
};

// Called from Editor.vue via DOM query + click simulation
const focusDefinition = (label: string) => {
  const idx = defs.value.findIndex(d => d.label === label);
  if (idx !== -1) startEdit(idx);
};

defineExpose({ focusDefinition });
</script>

<template>
  <NodeViewWrapper class="footnote-section-wrapper" :class="{ selected: props.selected }">
    <div class="footnote-header">
      <span class="footnote-label">{{ t.footnotes || 'Footnotes' }}</span>
    </div>
    <ol class="footnote-list">
      <li
        v-for="(def, index) in defs"
        :key="def.label"
        class="footnote-item"
        :data-index="index"
        :data-footnote-label="def.label"
      >
        <span class="footnote-def-index">{{ index + 1 }}.</span>
        <!-- Read mode -->
        <span
          v-if="editingIndex !== index"
          class="footnote-def-content"
          :class="{ empty: !def.content }"
          @click="startEdit(index)"
        >{{ def.content || t.footnoteContentPlaceholder || 'Click to add text...' }}</span>
        <!-- Edit mode -->
        <textarea
          v-else
          v-model="editContent"
          class="footnote-edit-input"
          rows="2"
          @keydown="handleKeydown"
          @blur="saveEdit"
        ></textarea>
        <!-- Backlink to ref in text -->
        <button
          class="footnote-backlink"
          :title="t.footnoteBacklink || 'Jump to reference'"
          @click="emitBacklink($event, def.label)"
        >&#x21a9;</button>
      </li>
    </ol>
  </NodeViewWrapper>
</template>

<style scoped>
.footnote-section-wrapper {
  margin: 2em 0 1em;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
}

.footnote-header {
  margin-bottom: 6px;
}

.footnote-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.footnote-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.footnote-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.9em;
  color: var(--text-secondary);
  line-height: 1.5;
  border-radius: 4px;
  transition: background 0.15s;
}

.footnote-def-index {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-muted);
  min-width: 20px;
  flex-shrink: 0;
}

.footnote-def-content {
  flex: 1;
  white-space: pre-wrap;
  cursor: text;
  padding: 2px 4px;
  border-radius: 3px;
  transition: background 0.15s;
}

.footnote-def-content:hover {
  background: var(--bg-tertiary, rgba(255,255,255,0.05));
}

.footnote-def-content.empty {
  color: var(--text-muted);
  font-style: italic;
}

.footnote-edit-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  border: 1px solid var(--primary);
  border-radius: 4px;
  background: var(--bg-input, var(--bg-primary));
  color: var(--text-primary);
  resize: vertical;
  box-sizing: border-box;
  outline: none;
}

.footnote-backlink {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 14px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0;
}

.footnote-item:hover .footnote-backlink {
  opacity: 1;
}

.footnote-backlink:hover {
  background: var(--primary);
  color: white;
}

/* Prominent pulse animation for both ref (sup) and definition (li) on navigation.
   Uses box-shadow rings so it works for inline and block elements alike. */
:global(.footnote-highlight) {
  border-radius: 4px;
  animation: footnote-pulse 3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  z-index: 2;
}

@keyframes footnote-pulse {
  0% {
    background: rgba(59, 130, 246, 0.85);
    box-shadow:
      0 0 0 4px rgba(59, 130, 246, 0.7),
      0 0 0 10px rgba(59, 130, 246, 0.25),
      0 0 22px 4px rgba(59, 130, 246, 0.55);
    color: white;
  }
  35% {
    background: rgba(59, 130, 246, 0.55);
    box-shadow:
      0 0 0 5px rgba(59, 130, 246, 0.5),
      0 0 0 12px rgba(59, 130, 246, 0.18),
      0 0 18px 4px rgba(59, 130, 246, 0.4);
    color: white;
  }
  70% {
    background: rgba(59, 130, 246, 0.2);
    box-shadow:
      0 0 0 2px rgba(59, 130, 246, 0.2),
      0 0 10px 2px rgba(59, 130, 246, 0.15);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}
</style>
