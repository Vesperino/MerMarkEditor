<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import Editor from './Editor.vue';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';
import { splitMarkdownForLazyPreview } from '../utils/lazy-markdown';
import { extractMarkdownToc } from '../utils/markdown-toc';

interface EditableChunk {
  markdown: string;
  lineCount: number;
}

const props = defineProps<{ markdown: string; filePath?: string | null }>();
const emit = defineEmits<{
  'update:markdown': [markdown: string];
  'update:hasChanges': [changed: boolean];
  'link-click': [href: string];
  'editor-focus': [editor: TiptapEditor];
}>();

const scrollerRef = ref<HTMLDivElement | null>(null);
const chunks = ref<EditableChunk[]>([]);
const scrollTop = ref(0);
const viewportHeight = ref(800);
const revision = ref(0);
const editorRefs = new Map<number, InstanceType<typeof Editor>>();
let heights: number[] = [];
let htmlCache = new Map<number, string>();
let frame = 0;
let emitTimer: ReturnType<typeof setTimeout> | null = null;

const getMarkdown = (): string => chunks.value.map(chunk => chunk.markdown).join('\n');

const flush = (): string => {
  if (emitTimer) {
    clearTimeout(emitTimer);
    emitTimer = null;
  }
  const markdown = getMarkdown();
  emit('update:markdown', markdown);
  return markdown;
};

const scrollToMarkdownOffset = async (offset: number): Promise<void> => {
  const root = scrollerRef.value;
  if (!root) return;

  let chunkStart = 0;
  let chunkIndex = 0;
  for (let i = 0; i < chunks.value.length; i++) {
    const chunkEnd = chunkStart + chunks.value[i].markdown.length;
    if (offset <= chunkEnd || i === chunks.value.length - 1) {
      chunkIndex = i;
      break;
    }
    chunkStart = chunkEnd + 1;
  }

  const approximateTop = heights.slice(0, chunkIndex).reduce((sum, height) => sum + height, 0);
  root.scrollTop = approximateTop;
  updateViewport();
  await nextTick();
  await nextTick();

  const section = root.querySelector<HTMLElement>(`[data-lazy-chunk="${chunkIndex}"]`);
  if (!section) return;
  const localOffset = Math.max(0, offset - chunkStart);
  const localHeadings = extractMarkdownToc(chunks.value[chunkIndex].markdown);
  const headingIndex = Math.max(0, localHeadings.findIndex(item => item.offset === localOffset));
  const heading = section.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')[headingIndex];
  if (!heading) return;
  const rootRect = root.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  root.scrollTo({
    top: Math.max(0, root.scrollTop + headingRect.top - rootRect.top - 24),
    behavior: 'smooth',
  });
};

defineExpose({ getMarkdown, flush, scrollToMarkdownOffset });

const resetDocument = (markdown: string) => {
  chunks.value = splitMarkdownForLazyPreview(markdown);
  heights = chunks.value.map(chunk => Math.max(120, chunk.lineCount * 25));
  htmlCache = new Map();
  editorRefs.clear();
  scrollTop.value = 0;
  if (scrollerRef.value) scrollerRef.value.scrollTop = 0;
  revision.value++;
};

watch(() => props.markdown, (markdown) => {
  if (markdown !== getMarkdown()) resetDocument(markdown);
});

const visibleRange = computed(() => {
  revision.value;
  const overscan = viewportHeight.value * 0.6;
  const fromY = Math.max(0, scrollTop.value - overscan);
  const toY = scrollTop.value + viewportHeight.value + overscan;
  let y = 0;
  let start = 0;
  let end = Math.max(0, chunks.value.length - 1);

  for (let i = 0; i < heights.length; i++) {
    const next = y + heights[i];
    if (next >= fromY) { start = i; break; }
    y = next;
  }
  for (let i = start; i < heights.length; i++) {
    y += heights[i];
    if (y >= toY) { end = i; break; }
  }
  return { start, end };
});

const isRendered = (index: number) => index >= visibleRange.value.start && index <= visibleRange.value.end;

const chunkHtml = (index: number): string => {
  const cached = htmlCache.get(index);
  if (cached !== undefined) return cached;
  const html = markdownToHtml(chunks.value[index].markdown);
  htmlCache.set(index, html);
  return html;
};

const placeholderStyle = (index: number) => isRendered(index)
  ? { minHeight: `${heights[index]}px` }
  : { height: `${heights[index]}px` };

const measureRendered = async () => {
  await nextTick();
  const root = scrollerRef.value;
  if (!root) return;
  let changed = false;
  for (const element of root.querySelectorAll<HTMLElement>('[data-lazy-chunk]')) {
    const index = Number(element.dataset.lazyChunk);
    if (!isRendered(index)) continue;
    const measured = Math.max(80, element.scrollHeight);
    if (Math.abs(measured - heights[index]) > 2) {
      heights[index] = measured;
      changed = true;
    }
  }
  if (changed) revision.value++;

  for (const index of htmlCache.keys()) {
    if (index < visibleRange.value.start - 1 || index > visibleRange.value.end + 1) htmlCache.delete(index);
  }
};

watch(visibleRange, () => { void measureRendered(); }, { immediate: true });

const scheduleMarkdownUpdate = () => {
  if (emitTimer) clearTimeout(emitTimer);
  emitTimer = setTimeout(() => {
    emitTimer = null;
    emit('update:markdown', getMarkdown());
  }, 400);
};

const handleChunkUpdate = (index: number, html: string) => {
  htmlCache.set(index, html);
  chunks.value[index].markdown = htmlToMarkdown(html).trimEnd();
  chunks.value[index].lineCount = Math.max(1, chunks.value[index].markdown.split('\n').length);
  emit('update:hasChanges', true);
  scheduleMarkdownUpdate();
  void measureRendered();
};

const setEditorRef = (index: number, instance: unknown) => {
  if (instance) editorRefs.set(index, instance as InstanceType<typeof Editor>);
  else editorRefs.delete(index);
};

const handleFocus = (index: number) => {
  const editor = editorRefs.get(index)?.editor as TiptapEditor | undefined;
  if (editor) emit('editor-focus', editor);
};

const updateViewport = () => {
  frame = 0;
  const root = scrollerRef.value;
  if (!root) return;
  scrollTop.value = root.scrollTop;
  viewportHeight.value = root.clientHeight || 800;
};

const handleScroll = () => {
  if (!frame) frame = requestAnimationFrame(updateViewport);
};

onMounted(() => {
  resetDocument(props.markdown);
  updateViewport();
});

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
  if (emitTimer) clearTimeout(emitTimer);
});
</script>

<template>
  <div ref="scrollerRef" class="lazy-editor" @scroll="handleScroll">
    <div class="lazy-editor-document">
      <section
        v-for="(_, index) in chunks"
        :key="index"
        class="lazy-editor-chunk"
        :data-lazy-chunk="index"
        :style="placeholderStyle(index)"
        @focusin="handleFocus(index)"
      >
        <Editor
          v-if="isRendered(index)"
          :ref="(instance) => setEditorRef(index, instance)"
          class="lazy-chunk-editor"
          :model-value="chunkHtml(index)"
          :file-path="filePath"
          :editable="true"
          @update:model-value="(html: string) => handleChunkUpdate(index, html)"
          @update:has-changes="(changed: boolean) => changed && emit('update:hasChanges', true)"
          @link-click="(href: string) => emit('link-click', href)"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.lazy-editor {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: var(--editor-container-bg);
}

.lazy-editor-document {
  width: 100%;
  margin: 20px 0;
  min-height: calc(100vh - 180px);
}

.lazy-editor-chunk { overflow: hidden; }
.lazy-chunk-editor { width: 100%; }
.lazy-chunk-editor :deep(.editor-container) { overflow: visible; background: transparent; }
.lazy-chunk-editor :deep(.editor-content-wrapper) { margin: 0 auto; }
.lazy-chunk-editor :deep(.editor-content) { min-height: 0; box-shadow: none; border-radius: 0; padding-top: 0; padding-bottom: 0; }
.lazy-chunk-editor :deep(.editor-content .tiptap) { min-height: 0; }
</style>
