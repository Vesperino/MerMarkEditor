<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
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

interface CodeGutterMetrics {
  lineHeight: number;
  paddingTop: number;
  paddingBottom: number;
}

interface CodeGutterLine {
  num: number;
  top: number;
  height: number;
}

const DEFAULT_GUTTER_METRICS: CodeGutterMetrics = {
  lineHeight: 22.4,
  paddingTop: 24,
  paddingBottom: 24,
};

const gutterMetrics = ref<CodeGutterMetrics>({ ...DEFAULT_GUTTER_METRICS });
let resizeObserver: ResizeObserver | null = null;

defineExpose({
  textarea: textareaRef,
});

const lineCount = computed(() => {
  const value = props.modelValue ?? '';
  return Math.max(1, value.split('\n').length);
});

const resolveTextareaMetrics = (textarea: HTMLTextAreaElement): CodeGutterMetrics => {
  const computedStyle = window.getComputedStyle(textarea);
  const fontSize = parseFloat(computedStyle.fontSize) || 14;
  const parsedLineHeight = parseFloat(computedStyle.lineHeight);

  return {
    lineHeight: computedStyle.lineHeight === 'normal' || Number.isNaN(parsedLineHeight)
      ? fontSize * 1.2
      : parsedLineHeight,
    paddingTop: parseFloat(computedStyle.paddingTop) || 0,
    paddingBottom: parseFloat(computedStyle.paddingBottom) || 0,
  };
};

const syncGutterMetrics = () => {
  const textarea = textareaRef.value;
  if (!textarea) {
    gutterMetrics.value = { ...DEFAULT_GUTTER_METRICS };
    return;
  }

  gutterMetrics.value = resolveTextareaMetrics(textarea);

  if (gutterRef.value) {
    gutterRef.value.scrollTop = textarea.scrollTop;
  }
};

const scheduleGutterSync = () => {
  requestAnimationFrame(syncGutterMetrics);
};

const gutterLines = computed<CodeGutterLine[]>(() => {
  const { lineHeight, paddingTop } = gutterMetrics.value;
  return Array.from({ length: lineCount.value }, (_, index) => ({
    num: index + 1,
    top: paddingTop + index * lineHeight,
    height: lineHeight,
  }));
});

const gutterContentHeight = computed(() => {
  const { lineHeight, paddingTop, paddingBottom } = gutterMetrics.value;
  return paddingTop + paddingBottom + lineCount.value * lineHeight;
});

watch(textareaRef, (textarea, previous) => {
  if (resizeObserver && previous) {
    resizeObserver.unobserve(previous);
  }

  if (!textarea) return;

  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(syncGutterMetrics);
  }

  resizeObserver.observe(textarea);
  scheduleGutterSync();
}, { immediate: true });

watch([
  () => props.modelValue,
  wordWrap,
  showLineNumbers,
  zoomScale,
  () => settings.value.codeFontFamily,
], scheduleGutterSync);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
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
      <div class="code-editor-gutter-content" :style="{ height: `${gutterContentHeight}px` }">
        <span
          v-for="line in gutterLines"
          :key="line.num"
          class="code-editor-gutter-line"
          :style="{
            top: `${line.top}px`,
            height: `${line.height}px`,
          }"
        >{{ line.num }}</span>
      </div>
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
  box-sizing: border-box;
  padding: 0 0.5em 0 0.75em;
  background: var(--code-editor-bg);
  color: var(--text-secondary, #888);
  opacity: 0.6;
  font-family: var(--code-font-family, "Fira Code", "Consolas", "Monaco", monospace);
  font-size: var(--code-font-size, 14px);
  line-height: 1;
  text-align: right;
  user-select: none;
  overflow: hidden;
  border-radius: 8px 0 0 8px;
  position: relative;
}

.code-editor-gutter-content {
  position: relative;
  min-height: 100%;
}

.code-editor-gutter-line {
  position: absolute;
  right: 0.5em;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  line-height: 1;
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
