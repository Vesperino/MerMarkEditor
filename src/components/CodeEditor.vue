<script setup lang="ts">
import { ref, computed } from 'vue';
import { useEditorZoom } from '../composables/useEditorZoom';

const { zoomScale } = useEditorZoom();
const codeZoomStyle = computed(() => ({ zoom: zoomScale.value }));

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
  overflow: auto;
  background: var(--code-editor-container-bg);
  padding: 20px;
}

.code-editor {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 180px);
  background: var(--code-editor-bg);
  color: var(--code-editor-text);
  border: none;
  border-radius: 8px;
  padding: 24px;
  font-family: "Fira Code", "Consolas", "Monaco", monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  tab-size: 2;
  white-space: pre;
  overflow-x: auto;
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
