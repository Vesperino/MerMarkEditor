<script setup lang="ts">
import { NodeViewWrapper } from "@tiptap/vue-3";
import { ref, watch, onMounted, computed, nextTick } from "vue";
import { renderMath, findMath } from '../utils/math';
import { useI18n } from '../i18n';

// Adapted from chinghssu/MerMarkEditorQ, commit b165dcf4 (MIT).
const { t } = useI18n();

const props = defineProps<{
  node: {
    type: { name: string };
    attrs: { formula: string; source?: string };
  };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  deleteNode: () => void;
  selected: boolean;
}>();

const isBlock = computed(() => props.node.type.name === "katexBlock");
const encodedFormula = computed(() => encodeURIComponent(props.node.attrs.formula));

const isEditing = ref(false);
const editFormula = ref(props.node.attrs.formula);
const renderedHtml = ref("");
const error = ref<string | null>(null);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const render = () => {
  const result = renderMath(props.node.attrs.formula, isBlock.value);
  renderedHtml.value = result.html;
  error.value = result.error;
};

const startEdit = () => {
  editFormula.value = props.node.attrs.formula;
  isEditing.value = true;
  nextTick(() => textareaRef.value?.focus());
};

const saveEdit = () => {
  let source = props.node.attrs.source ?? '';
  const old = findMath(source)[0];
  if (old && old.formula !== old.source) {
    const offset = source.indexOf(old.formula);
    source = source.slice(0, offset) + editFormula.value + source.slice(offset + old.formula.length);
  } else source = '';
  props.updateAttributes({ formula: editFormula.value, source });
  isEditing.value = false;
};

const cancelEdit = () => {
  editFormula.value = props.node.attrs.formula;
  isEditing.value = false;
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "Escape") cancelEdit();
  if ((e.key === "Enter" && (e.ctrlKey || e.metaKey)) || (e.key === "Enter" && !isBlock.value)) {
    e.preventDefault();
    saveEdit();
  }
};

watch(() => props.node.attrs.formula, render);
onMounted(render);
</script>

<template>
  <NodeViewWrapper
    :as="isBlock ? 'div' : 'span'"
    class="katex-wrapper"
    :class="{ 'katex-block': isBlock, 'katex-inline': !isBlock, selected: props.selected }"
    :data-type="isBlock ? 'katex-block' : 'katex-inline'"
    :data-formula="encodedFormula"
    :data-math-source="encodeURIComponent(props.node.attrs.source ?? '')"
    contenteditable="false"
  >
    <!-- View mode -->
    <template v-if="!isEditing">
      <span v-html="renderedHtml" class="katex-render" :class="{ 'katex-error': error }" :title="error ?? t.mathEdit" tabindex="0" role="button" :aria-label="t.mathEdit" @dblclick="startEdit" @keydown.enter.prevent="startEdit"></span>
      <span class="katex-actions">
        <button class="katex-btn" :title="t.mathEdit" @click="startEdit">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button class="katex-btn danger" :title="t.mathDelete" @click="props.deleteNode">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </span>
    </template>

    <!-- Edit mode -->
    <template v-else>
      <span class="katex-editor">
        <textarea
          ref="textareaRef"
          v-model="editFormula"
          class="katex-textarea"
          :aria-label="t.mathSource"
          :rows="isBlock ? 4 : 1"
          :placeholder="isBlock ? 'Enter LaTeX formula...\nE.g.: \\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}' : 'LaTeX formula'"
          @keydown="handleKeydown"
        ></textarea>
        <span class="katex-editor-actions">
          <button class="katex-save-btn" @click="saveEdit">{{ t.save }}</button>
          <button class="katex-cancel-btn" @click="cancelEdit">{{ t.cancel }}</button>
        </span>
      </span>
    </template>
  </NodeViewWrapper>
</template>

<style scoped>
.katex-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.katex-block {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  margin: 6px 0;
  border-radius: 4px;
  overflow-x: auto;
  border: 1px solid transparent;
  transition: border-color 0.15s;
}

.katex-block:hover {
  border-color: var(--border-primary);
}

.katex-block.selected {
  border-color: var(--primary);
}

.katex-inline {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  border-radius: 3px;
  border: 1px solid transparent;
}

.katex-inline.selected {
  border-color: var(--primary);
}

.katex-render {
  cursor: default;
  max-width: 100%;
  overflow-wrap: anywhere;
}

.katex-render :deep(.katex) {
  font-size: 1.1em;
}

.katex-block .katex-render :deep(.katex) {
  font-size: 1.3em;
  max-width: 100%;
  white-space: nowrap;
}

.katex-block .katex-render :deep(.katex-display) {
  margin: 0;
  max-width: 100%;
  overflow: auto;
  white-space: nowrap;
}

.katex-block .katex-render :deep(.katex-html) {
  white-space: nowrap;
}

.katex-error {
  color: var(--error-color, #ef4444);
  font-size: 12px;
  font-family: monospace;
  padding: 2px 6px;
  background: var(--error-bg, rgba(239, 68, 68, 0.1));
  border-radius: 3px;
}

/* 浮動工具列：絕對定位，平時隱藏，hover 才顯示 */
.katex-actions {
  position: absolute;
  top: -2px;
  right: -2px;
  display: inline-flex;
  gap: 2px;
  padding: 2px 3px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  box-shadow: var(--shadow-dropdown, 0 2px 8px rgba(0,0,0,0.12));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  z-index: 10;
}

.katex-wrapper:hover .katex-actions,
.katex-wrapper:focus-within .katex-actions {
  opacity: 1;
  pointer-events: auto;
}

/* Keep controls above inline formulas so they cannot intercept double-clicks. */
.katex-inline .katex-actions {
  top: auto;
  bottom: 100%;
  right: 0;
}

.katex-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}

.katex-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.katex-btn.danger:hover {
  background: var(--danger-bg, rgba(239, 68, 68, 0.1));
  color: var(--danger, #ef4444);
}

.katex-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.katex-textarea {
  width: 100%;
  padding: 8px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  background: var(--bg-input);
  color: var(--text-primary);
  resize: vertical;
  min-height: 36px;
}

.katex-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.katex-editor-actions {
  display: flex;
  gap: 6px;
}

.katex-save-btn,
.katex-cancel-btn {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.katex-save-btn {
  background: var(--success, #22c55e);
  color: white;
}

.katex-save-btn:hover {
  background: var(--success-dark, #16a34a);
}

.katex-cancel-btn {
  background: var(--text-muted);
  color: white;
}

.katex-cancel-btn:hover {
  background: var(--text-secondary);
}
</style>
