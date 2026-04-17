<script setup lang="ts">
import { ref, computed } from 'vue';
import { useEditorZoom } from '../composables/useEditorZoom';
import { useSettings } from '../composables/useSettings';

const { zoomScale } = useEditorZoom();
const { settings } = useSettings();

const codeZoomStyle = computed(() => ({ zoom: zoomScale.value }));
const wordWrap = computed(() => settings.value.codeWordWrap);
const showLineNumbers = computed(() => settings.value.showLineNumbers);

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const gutterRef = ref<HTMLDivElement | null>(null);

defineExpose({
  textarea: textareaRef,
});

const lineCount = computed(() => {
  const value = props.modelValue ?? '';
  return Math.max(1, value.split('\n').length);
});

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
};

const handleScroll = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  if (gutterRef.value) {
    gutterRef.value.scrollTop = target.scrollTop;
  }
};
</script>

<template>
  <div class="code-editor-container" :class="{ 'has-line-numbers': showLineNumbers }">
    <div
      v-if="showLineNumbers"
      ref="gutterRef"
      class="code-editor-gutter"
      :style="codeZoomStyle"
      aria-hidden="true"
    >
      <span v-for="n in lineCount" :key="n" class="code-editor-gutter-line">{{ n }}</span>
    </div>
    <textarea
      id="code-editor-textarea"
      ref="textareaRef"
      class="code-editor"
      :class="{ 'word-wrap': wordWrap }"
      :style="codeZoomStyle"
      :value="modelValue"
      @input="handleInput"
      @scroll="handleScroll"
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

.code-editor-container.has-line-numbers {
  flex-direction: row;
  gap: 0;
}

.code-editor-gutter {
  flex: 0 0 auto;
  min-width: 3em;
  padding: 24px 0.5em 24px 0.75em;
  background: var(--code-editor-bg);
  color: var(--text-secondary, #888);
  opacity: 0.6;
  font-family: var(--code-font-family, "Fira Code", "Consolas", "Monaco", monospace);
  font-size: var(--code-font-size, 14px);
  line-height: 1.6;
  text-align: right;
  user-select: none;
  overflow: hidden;
  border-radius: 8px 0 0 8px;
  white-space: pre;
}

.code-editor-gutter-line {
  display: block;
}

.code-editor-container.has-line-numbers .code-editor {
  border-radius: 0 8px 8px 0;
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
