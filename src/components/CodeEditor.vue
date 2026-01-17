<script setup lang="ts">
import { ref } from 'vue';

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
  background: #1e293b;
  padding: 20px;
}

.code-editor {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 180px);
  background: #0f172a;
  color: #e2e8f0;
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
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

@media print {
  .code-editor-container {
    display: none !important;
  }
}
</style>
