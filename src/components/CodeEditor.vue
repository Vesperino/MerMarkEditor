<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Compartment, EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { useEditorZoom } from '../composables/useEditorZoom';
import { useSettings } from '../composables/useSettings';
import type { CodeEditorHandle } from '../types/code-editor';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const { zoomScale } = useEditorZoom();
const { settings } = useSettings();
const hostRef = ref<HTMLDivElement | null>(null);
const wrapConfig = new Compartment();
const gutterConfig = new Compartment();
let view: EditorView | null = null;
let applyingExternalValue = false;
let lastSyncedValue = props.modelValue;
let highlightedLine: HTMLElement | null = null;
let highlightTimer: number | null = null;

const clearSelectionHighlight = () => {
  highlightedLine?.classList.remove('cursor-highlight-line');
  highlightedLine = null;
  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
    highlightTimer = null;
  }
};

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--code-md-heading)', fontWeight: '600' },
  { tag: tags.list, color: 'var(--code-md-bullet)' },
  { tag: tags.strong, color: 'var(--code-md-strong)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'var(--code-md-emphasis)', fontStyle: 'italic' },
  { tag: [tags.link, tags.url, tags.string], color: 'var(--code-md-link)' },
  { tag: [tags.monospace, tags.quote], color: 'var(--code-md-code)' },
  { tag: [tags.meta, tags.processingInstruction, tags.contentSeparator], color: 'var(--code-md-meta)' },
]);

const codeZoomStyle = computed(() => ({ zoom: zoomScale.value }));

const editor: CodeEditorHandle = {
  focus: () => view?.focus(),
  getValue: () => view?.state.doc.toString() ?? props.modelValue,
  getSelection: () => {
    const range = view?.state.selection.main;
    return range ? { start: range.from, end: range.to } : { start: 0, end: 0 };
  },
  setSelection: (start, end = start) => {
    if (!view) return;
    const length = view.state.doc.length;
    const anchor = Math.max(0, Math.min(start, length));
    const head = Math.max(0, Math.min(end, length));
    view.dispatch({
      selection: { anchor, head },
      effects: EditorView.scrollIntoView(head, { y: 'center' }),
    });
  },
  replaceSelection: (text) => {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
      scrollIntoView: true,
    });
  },
  getScrollRatio: () => {
    if (!view) return 0;
    const maxScroll = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    return maxScroll > 0 ? view.scrollDOM.scrollTop / maxScroll : 0;
  },
  scrollToRatio: (ratio) => {
    if (!view) return;
    const maxScroll = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
    view.scrollDOM.scrollTop = Math.max(0, Math.min(1, ratio)) * Math.max(0, maxScroll);
  },
  scrollToPosition: (position) => {
    if (!view) return;
    const pos = Math.max(0, Math.min(position, view.state.doc.length));
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  },
  highlightSelectionLine: (durationMs = 1000) => {
    if (!view) return;
    clearSelectionHighlight();
    const domAtCursor = view.domAtPos(view.state.selection.main.head).node;
    const cursorElement = domAtCursor instanceof Element ? domAtCursor : domAtCursor.parentElement;
    const line = cursorElement?.closest<HTMLElement>('.cm-line') ?? null;
    if (!line) return;

    // Force a fresh animation when the same line is highlighted repeatedly.
    line.classList.add('cursor-highlight-line');
    void line.offsetWidth;
    highlightedLine = line;
    highlightTimer = window.setTimeout(clearSelectionHighlight, durationMs);
  },
};

defineExpose({ editor });

onMounted(() => {
  if (!hostRef.value) return;
  view = new EditorView({
    parent: hostRef.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        markdown(),
        syntaxHighlighting(markdownHighlightStyle),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        wrapConfig.of(settings.value.codeWordWrap ? EditorView.lineWrapping : []),
        gutterConfig.of(settings.value.showLineNumbers ? lineNumbers() : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValue) {
            lastSyncedValue = update.state.doc.toString();
            emit('update:modelValue', lastSyncedValue);
          }
        }),
        EditorView.theme({
          '&': { height: '100%', backgroundColor: 'var(--code-editor-bg)', color: 'var(--code-editor-text)' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: 'var(--code-font-family, "Fira Code", "Consolas", "Monaco", monospace)',
            fontSize: 'var(--code-font-size, 14px)',
            lineHeight: '1.6',
          },
          '.cm-content': { minHeight: '100%', padding: '24px 0', caretColor: 'var(--code-editor-text)' },
          '.cm-line': { padding: '0 24px' },
          '.cm-gutters': {
            backgroundColor: 'var(--code-editor-bg)',
            color: 'var(--code-editor-gutter-text, var(--text-secondary, #888))',
            border: 'none',
            borderRadius: '8px 0 0 8px',
            minWidth: '3em',
            opacity: '0.6',
            fontFamily: 'var(--code-font-family, "Fira Code", "Consolas", "Monaco", monospace)',
            fontSize: 'var(--code-font-size, 14px)',
          },
          '.cm-lineNumbers .cm-gutterElement': { padding: '0 0.5em 0 0.75em', minWidth: '3em' },
          '&.cm-focused': { outline: 'none', boxShadow: '0 0 0 2px var(--focus-ring-alpha)' },
        }),
      ],
    }),
  });
});

watch(() => props.modelValue, (value) => {
  if (!view || value === lastSyncedValue) return;
  applyingExternalValue = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  lastSyncedValue = value;
  applyingExternalValue = false;
});

watch(() => settings.value.codeWordWrap, (enabled) => {
  view?.dispatch({ effects: wrapConfig.reconfigure(enabled ? EditorView.lineWrapping : []) });
});

watch(() => settings.value.showLineNumbers, (enabled) => {
  view?.dispatch({ effects: gutterConfig.reconfigure(enabled ? lineNumbers() : []) });
});

onBeforeUnmount(() => {
  clearSelectionHighlight();
  view?.destroy();
  view = null;
});
</script>

<template>
  <div class="code-editor-container">
    <div
      ref="hostRef"
      class="code-editor"
      :style="codeZoomStyle"
      :data-document-length="modelValue.length"
    ></div>
  </div>
</template>

<style scoped>
.code-editor-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--code-editor-container-bg);
  padding: 20px;
}

.code-editor {
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 8px;
  font-size: var(--code-font-size, 14px);
}

.code-editor :deep(.cm-editor) { border-radius: 8px; }
.code-editor :deep(.cm-scroller) { tab-size: var(--code-tab-size, 2); }

@media print {
  .code-editor-container { display: none !important; }
}
</style>
