<script setup lang="ts">
import { ref, computed } from 'vue';
import { useEditorZoom } from '../composables/useEditorZoom';
import { useSettings } from '../composables/useSettings';

const { zoomScale } = useEditorZoom();
const { settings } = useSettings();

const codeZoomStyle = computed(() => ({ zoom: zoomScale.value }));
const wordWrap = computed(() => settings.value.codeWordWrap);

defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);

// Expose ref for parent to access
defineExpose({
  textarea: textareaRef,
});

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
};
</script>

<template>
  <div class="code-editor-container">
    <textarea
      id="code-editor-textarea"
      ref="textareaRef"
      class="code-editor"
      :class="{ 'word-wrap': wordWrap }"
      :style="codeZoomStyle"
      :value="modelValue"
      @input="handleInput"
      spellcheck="false"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
    ></textarea>
  </div>
</template>

<style scoped>
.code-editor-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--code-editor-container-bg);
  padding: 20px;
}

.code-editor {
  flex: 1;
  width: 100%;
  min-height: 0;
  background: var(--code-editor-bg);
  color: var(--code-editor-text);
  border: none;
  border-radius: 8px;
  padding: 24px;
  font-family: var(--code-font-family, "Fira Code", "Consolas", "Monaco", monospace);
  font-size: var(--code-font-size, 14px);
  line-height: 1.6;
  resize: none;
  outline: none;
  tab-size: var(--code-tab-size, 2);
  white-space: pre;
  overflow-x: auto;
  overflow-y: auto;
}

.code-editor.word-wrap {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-x: hidden;
}

.code-editor:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring-alpha);
}

@media print {
  .code-editor-container {
    display: none !important;
  }
}
</style>
