<script setup lang="ts">
import { ref, shallowRef, computed, watch, onUnmounted, inject, nextTick, useId, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { useI18n } from '../i18n';
import { SCROLL_OFFSET } from '../constants';
import { targetScrollTop } from '../utils/scroll';
import { pickActiveHeading } from '../composables/useScrollSpy';
import type { MarkdownTocItem } from '../utils/markdown-toc';

const { t } = useI18n();
const injectedEditor = inject<Ref<Editor | null>>('editor', ref(null));
const props = withDefaults(defineProps<{
  markdown?: string | null;
  floating?: boolean;
  editorInstance?: Editor | null;
}>(), { markdown: null, floating: false });
const editor = computed(() => props.editorInstance === undefined ? injectedEditor.value : props.editorInstance);
const panelId = useId();
const indexRoot = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const isOpen = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function indexHasFocus() {
  return indexRoot.value?.contains(document.activeElement) ?? false;
}

function setOpen(open: boolean) {
  clearTimeout(hoverTimer);
  if (isOpen.value === open) return;
  isOpen.value = open;
  if (open) {
    document.addEventListener('keydown', onOpenKeydown, true);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    nextTick(() => {
      const content = tocContentRef.value;
      const active = content?.querySelector<HTMLElement>('.toc-item.active');
      if (isOpen.value && content && active) content.scrollTop = active.offsetTop - content.offsetTop - SCROLL_OFFSET;
    });
  } else {
    removeOpenListeners();
  }
}
function removeOpenListeners() {
  document.removeEventListener('keydown', onOpenKeydown, true);
  document.removeEventListener('pointerdown', onOutsidePointer, true);
}
function onPointerEnter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(hoverTimer);
  if (!isOpen.value) hoverTimer = setTimeout(() => setOpen(true), 120);
}
function onPointerLeave(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(hoverTimer);
  if (isOpen.value) {
    hoverTimer = setTimeout(() => {
      if (!indexHasFocus()) setOpen(false);
    }, 220);
  }
}
function dismiss() {
  if (indexHasFocus()) triggerRef.value?.focus({ preventScroll: true });
  setOpen(false);
}
function onOpenKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  dismiss();
}
function onSidebarEscape(event: KeyboardEvent) {
  if (props.floating) return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
}
function onFocusOut(event: FocusEvent) {
  if (!indexRoot.value?.contains(event.relatedTarget as Node | null)) setOpen(false);
}
function onOutsidePointer(event: PointerEvent) {
  if (!indexRoot.value?.contains(event.target as Node)) dismiss();
}
function preserveEditorFocus(event: PointerEvent) {
  // Button press normally blurs ProseMirror, which can dispatch a transaction.
  if (props.floating && event.button === 0 && document.activeElement?.closest('.ProseMirror')) {
    event.preventDefault();
  }
}
async function focusHeading() {
  setOpen(true);
  await nextTick();
  if (!isOpen.value) return;
  const content = tocContentRef.value;
  (content?.querySelector<HTMLElement>('.toc-item.active') ?? content?.querySelector<HTMLElement>('.toc-item'))?.focus();
}

interface TocItem {
  level: number;
  text: string;
  id: string;
  pos: number;
  kind?: 'heading' | 'footnotes';
}

const emit = defineEmits<{
  close: [];
  'headings-change': [count: number];
  'markdown-heading-click': [offset: number];
}>();

const headings = shallowRef<TocItem[]>([]);
let hasTableHeadings = false;
watch(() => headings.value.length, count => emit('headings-change', count), { immediate: true });
const activeHeadingId = ref<string | null>(null);
const headingIndices = computed(() => new Map(headings.value.map((item, index) => [item.id, index])));
// Keep the resting rail quiet even for documents with hundreds of sections.
const railHeadings = computed(() => {
  const items = headings.value;
  if (items.length <= 18) return items;
  const indices = new Set(Array.from({ length: 18 }, (_, i) => Math.round(i * (items.length - 1) / 17)));
  const active = headingIndices.value.get(activeHeadingId.value ?? '') ?? -1;
  if (active >= 0 && !indices.has(active)) {
    const nearest = [...indices].reduce((a, b) => Math.abs(a - active) < Math.abs(b - active) ? a : b);
    indices.delete(nearest);
    indices.add(active);
  }
  return [...indices].sort((a, b) => a - b).map(i => items[i]);
});
const tocContentRef = ref<HTMLElement | null>(null);
const tocScrollTop = ref(0);
const tocViewportHeight = ref(600);
const MARKDOWN_TOC_ROW_HEIGHT = 32;
const MARKDOWN_TOC_OVERSCAN = 8;
let tocWorker: Worker | null = null;
let workerRequestId = 0;

const markdownVisibleRange = computed(() => {
  if (props.markdown === null) return { start: 0, end: headings.value.length };
  const start = Math.max(0, Math.floor(tocScrollTop.value / MARKDOWN_TOC_ROW_HEIGHT) - MARKDOWN_TOC_OVERSCAN);
  const visibleRows = Math.ceil(tocViewportHeight.value / MARKDOWN_TOC_ROW_HEIGHT);
  const end = Math.min(headings.value.length, start + visibleRows + MARKDOWN_TOC_OVERSCAN * 2);
  return { start, end };
});

const displayedHeadings = computed(() => headings.value.slice(
  markdownVisibleRange.value.start,
  markdownVisibleRange.value.end,
));
const tocTopSpacer = computed(() => props.markdown === null
  ? 0
  : markdownVisibleRange.value.start * MARKDOWN_TOC_ROW_HEIGHT);
const tocBottomSpacer = computed(() => props.markdown === null
  ? 0
  : Math.max(0, headings.value.length - markdownVisibleRange.value.end) * MARKDOWN_TOC_ROW_HEIGHT);

const onTocScroll = () => {
  tocScrollTop.value = tocContentRef.value?.scrollTop ?? 0;
};

const extractMarkdownHeadings = (markdown: string) => {
  if (!tocWorker) {
    tocWorker = new Worker(new URL('../workers/markdown-toc.worker.ts', import.meta.url), { type: 'module' });
    tocWorker.onmessage = (event: MessageEvent<{ id: number; items: MarkdownTocItem[] }>) => {
      if (event.data.id !== workerRequestId) return;
      headings.value = event.data.items.map(item => ({
        level: item.level,
        text: item.text,
        id: `toc-markdown-${item.offset}`,
        pos: item.offset,
        kind: 'heading',
      }));
    };
  }
  const id = ++workerRequestId;
  tocWorker.postMessage({ id, markdown });
};

const extractHeadings = () => {
  if (props.markdown !== null) return;
  hasTableHeadings = false;
  if (!editor?.value) {
    headings.value = [];
    return;
  }

  const items: TocItem[] = [];
  const doc = editor.value.state.doc;
  let footnotesPos: number | null = null;
  let tableEnd = 0;

  doc.descendants((node, pos) => {
    if (node.type.name === 'table') {
      tableEnd = Math.max(tableEnd, pos + node.nodeSize);
    } else if (node.type.name === 'heading') {
      const level = node.attrs.level as number;
      const text = node.textContent;
      if (text.trim()) {
        items.push({ level, text, id: `toc-heading-${pos}`, pos, kind: 'heading' });
        if (pos < tableEnd) hasTableHeadings = true;
      }
    } else if (node.type.name === 'footnoteSection') {
      footnotesPos = pos;
    }
    if (node.isTextblock) return false;
  });

  // Append Footnotes entry at the end if section exists
  if (footnotesPos !== null) {
    items.push({
      level: 0,
      text: t.value.footnotes || 'Footnotes',
      id: 'toc-footnotes',
      pos: footnotesPos,
      kind: 'footnotes',
    });
  }

  const previous = headings.value;
  if (items.length !== previous.length || items.some((item, i) =>
    item.pos !== previous[i].pos || item.text !== previous[i].text ||
    item.level !== previous[i].level || item.kind !== previous[i].kind
  )) {
    headings.value = items;
  }
};

// Compute min heading level for proper indentation (skip footnotes entry at level 0)
const minLevel = computed(() => {
  let level = Infinity;
  for (const heading of headings.value) {
    if (heading.kind !== 'footnotes') level = Math.min(level, heading.level);
  }
  return Number.isFinite(level) ? level : 1;
});

const scrollContainerTo = (container: Element, target: Element) => {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = targetScrollTop(containerRect.top, targetRect.top, container.scrollTop, SCROLL_OFFSET);
  container.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
};

const scrollToHeading = (item: TocItem) => {
  if (props.floating) dismiss();
  if (props.markdown !== null) {
    emit('markdown-heading-click', item.pos);
    activeHeadingId.value = item.id;
    return;
  }
  if (!editor.value) return;

  if (props.floating) {
    // Scrolling an outline target should leave the document and caret untouched.
    const heading = resolveHeadingEl(item);
    const container = heading?.closest('.editor-container');
    if (heading && container) scrollContainerTo(container, heading);
    activeHeadingId.value = item.id;
    return;
  }

  // Footnotes entry: direct DOM scroll to section wrapper (atom block, no inner content)
  if (item.kind === 'footnotes') {
    // scrollIntoView:false + rAF defer keep OUR scroll authoritative — otherwise the
    // editor's own caret-into-view runs and can leave the target at the viewport
    // bottom instead of the top (issue #114).
    editor.value.commands.focus(undefined, { scrollIntoView: false });
    const container = editor.value.view.dom.closest('.editor-container');
    const section = container?.querySelector('.footnote-section-wrapper');
    if (container && section) requestAnimationFrame(() => scrollContainerTo(container, section));
    activeHeadingId.value = item.id;
    return;
  }

  // Regular heading: move the cursor WITHOUT the editor auto-scrolling, then run our
  // own scroll on the next frame so it wins (issue #114: heading was landing at the
  // bottom of the viewport instead of the top).
  editor.value.commands.setTextSelection(item.pos + 1);
  editor.value.commands.focus(undefined, { scrollIntoView: false });

  const { node } = editor.value.view.domAtPos(item.pos + 1);
  const headingEl = node instanceof HTMLElement ? node : node.parentElement;

  if (headingEl) {
    const container = headingEl.closest('.editor-container');
    if (container) requestAnimationFrame(() => scrollContainerTo(container, headingEl));
  }

  activeHeadingId.value = item.id;
};

// ── Scrollspy: highlight the heading of the current section while scrolling ──
let scrollContainer: HTMLElement | null = null;
let rafId = 0;
let documentResizeObserver: ResizeObserver | null = null;
const headingElements = new Map<number, HTMLElement>();

const resolveHeadingEl = (item: TocItem): HTMLElement | null => {
  if (!editor.value) return null;
  const view = editor.value.view;
  const cached = headingElements.get(item.pos);
  if (cached && view.dom.contains(cached)) return cached;
  const node = view.nodeDOM(item.pos);
  if (!(node instanceof HTMLElement)) return null;
  const target = item.kind === 'footnotes'
    ? node.querySelector<HTMLElement>('.footnote-section-wrapper') ?? node
    : node;
  headingElements.set(item.pos, target);
  return target;
};

const findFloatingActiveHeading = (threshold: number, atBottom: boolean): string => {
  const items = headings.value;
  const last = items[items.length - 1];
  if (atBottom) return last.id;

  let end = items.length;
  // The footnote section always appears at the end of the outline.
  if (last.kind === 'footnotes') {
    const top = resolveHeadingEl(last)?.getBoundingClientRect().top;
    if (top !== undefined && top <= threshold) return last.id;
    end--;
  }

  let start = 0;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    const top = resolveHeadingEl(items[middle])?.getBoundingClientRect().top ?? Infinity;
    if (top <= threshold) start = middle + 1;
    else end = middle;
  }
  return items[Math.max(0, start - 1)].id;
};

const updateActiveHeading = () => {
  if (!scrollContainer || headings.value.length === 0) {
    activeHeadingId.value = null;
    return;
  }
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const atBottom =
    scrollContainer.scrollHeight > scrollContainer.clientHeight + 2 &&
    scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2;
  // Headings in adjacent table cells can be out of vertical order.
  if (props.floating && !hasTableHeadings) {
    activeHeadingId.value = findFloatingActiveHeading(containerTop + SCROLL_OFFSET, atBottom);
    return;
  }

  const tops = headings.value
    .map((h) => {
      const el = resolveHeadingEl(h);
      return el ? { id: h.id, top: el.getBoundingClientRect().top - containerTop } : null;
    })
    .filter((t): t is { id: string; top: number } => t !== null);
  activeHeadingId.value = pickActiveHeading(tops, SCROLL_OFFSET, atBottom);
};

const onContainerScroll = () => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    updateActiveHeading();
  });
};

const detachScrollSpy = () => {
  scrollContainer?.removeEventListener('scroll', onContainerScroll);
  window.removeEventListener('resize', onContainerScroll);
  documentResizeObserver?.disconnect();
  documentResizeObserver = null;
  scrollContainer = null;
  headingElements.clear();
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
};

const attachScrollSpy = () => {
  detachScrollSpy();
  const dom = editor?.value?.view.dom as HTMLElement | undefined;
  scrollContainer = (dom?.closest('.editor-container') as HTMLElement | null) ?? null;
  scrollContainer?.addEventListener('scroll', onContainerScroll, { passive: true });
  window.addEventListener('resize', onContainerScroll);
  if (dom && scrollContainer) {
    documentResizeObserver = new ResizeObserver(onContainerScroll);
    documentResizeObserver.observe(dom);
    documentResizeObserver.observe(scrollContainer);
  }
  onContainerScroll();
};

// Update headings on editor changes
const onEditorUpdate = () => {
  headingElements.clear();
  extractHeadings();
  if (props.floating && headings.value.length === 0) dismiss();
  onContainerScroll();
};

// Watch for editor instance changes
watch(
  () => editor?.value,
  (newEditor, oldEditor) => {
    if (oldEditor) {
      oldEditor.off('update', onEditorUpdate);
      detachScrollSpy();
    }
    if (props.markdown !== null) return;
    extractHeadings();
    if (newEditor) {
      newEditor.on('update', onEditorUpdate);
      nextTick(() => {
        if (indexRoot.value && editor.value === newEditor) attachScrollSpy();
      });
    }
  },
  { immediate: true }
);

watch(
  () => props.markdown,
  (markdown) => {
    if (markdown !== null) extractMarkdownHeadings(markdown);
  },
  { immediate: true },
);

watch(tocContentRef, (content, _, onCleanup) => {
  if (!content || props.markdown === null) return;
  tocViewportHeight.value = content.clientHeight || 600;
  const observer = new ResizeObserver(([entry]) => {
    tocViewportHeight.value = entry.contentRect.height;
  });
  observer.observe(content);
  onCleanup(() => observer.disconnect());
});

onUnmounted(() => {
  clearTimeout(hoverTimer);
  removeOpenListeners();
  if (editor?.value) {
    editor.value.off('update', onEditorUpdate);
  }
  detachScrollSpy();
  tocWorker?.terminate();
  tocWorker = null;
});
</script>

<template>
  <div
    ref="indexRoot"
    v-show="!floating || headings.length > 0"
    :class="floating ? 'editor-index' : 'toc-sidebar'"
    @pointerenter="floating && onPointerEnter($event)"
    @pointerleave="floating && onPointerLeave($event)"
    @focusout="floating && onFocusOut($event)"
    @keydown.esc="onSidebarEscape"
  >
    <button
      v-if="floating"
      ref="triggerRef"
      class="index-trigger"
      :aria-label="t.tableOfContents"
      :aria-expanded="isOpen"
      :aria-controls="panelId"
      @pointerdown="preserveEditorFocus"
      @click="setOpen(!isOpen)"
      @focus="($event.target as HTMLElement).matches(':focus-visible') && setOpen(true)"
      @keydown.down.prevent="focusHeading"
    >
      <span class="index-marks" aria-hidden="true">
        <span v-for="item in railHeadings" :key="item.id" class="index-mark"
          :class="{ active: activeHeadingId === item.id }"
          :style="{ width: `${Math.max(8, 22 - Math.max(0, item.level - minLevel) * 4)}px` }" />
      </span>
    </button>
    <div :id="panelId" class="toc-panel" :class="{ 'index-flyout': floating, 'is-open': isOpen }"
      :inert="floating && !isOpen ? true : undefined">
      <div class="toc-header">
        <h3 class="toc-title">{{ t.tableOfContents }}</h3>
        <button class="toc-close-btn" @pointerdown="preserveEditorFocus" @click="floating ? dismiss() : emit('close')"
          :title="t.close" :aria-label="t.close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div v-if="!floating || isOpen" ref="tocContentRef" class="toc-content" @scroll.passive="onTocScroll">
        <div v-if="headings.length === 0" class="toc-empty">
          {{ t.tocEmpty }}
        </div>
        <nav v-else :aria-label="t.tableOfContents" class="toc-nav" :class="{ virtualized: props.markdown !== null }">
          <div v-if="tocTopSpacer" class="toc-spacer" :style="{ height: `${tocTopSpacer}px` }" />
          <button
            v-for="item in displayedHeadings"
            :key="item.id"
            class="toc-item"
            :class="[
              `toc-level-${item.level}`,
              { active: activeHeadingId === item.id, 'toc-footnotes-entry': item.kind === 'footnotes' },
            ]"
            :style="{ paddingLeft: `${Math.max(item.level - minLevel, 0) * 16 + 12}px` }"
            @pointerdown="preserveEditorFocus"
            @click="scrollToHeading(item)"
            :aria-current="activeHeadingId === item.id ? 'location' : undefined"
            :title="item.text"
          >
            <span class="toc-level-indicator">
              <template v-if="item.kind === 'footnotes'">&sect;</template>
              <template v-else>H{{ item.level }}</template>
            </span>
            <span class="toc-item-text">{{ item.text }}</span>
          </button>
          <div v-if="tocBottomSpacer" class="toc-spacer" :style="{ height: `${tocBottomSpacer}px` }" />
        </nav>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toc-sidebar { height: 100%; flex-shrink: 0; }
.editor-index {
  position: absolute;
  top: 24px;
  right: var(--editor-index-inset, 14px);
  bottom: 24px;
  width: var(--editor-index-width, 36px);
  z-index: 20;
  pointer-events: none;
}
.index-trigger {
  display: flex;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 13px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transition: background 160ms;
}
.index-marks { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
.index-mark {
  display: block;
  height: 2px;
  border-radius: 2px;
  background: var(--text-muted);
  opacity: .35;
  transition: opacity 160ms, background 160ms;
}
.index-mark.active { background: var(--primary); opacity: .9; }
.index-trigger:hover, .index-trigger[aria-expanded="true"] { background: var(--hover-bg); }
.index-trigger:hover .index-mark { opacity: .65; }
.index-trigger:focus-visible, .toc-item:focus-visible, .toc-close-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}
.toc-panel.index-flyout {
  position: absolute;
  top: 0;
  right: var(--editor-index-width, 36px);
  width: 264px;
  min-width: 0;
  max-width: min(calc(100vw - 90px), calc(100cqw - 70px));
  height: auto;
  max-height: min(480px, 100%);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  background: var(--bg-primary);
  box-shadow: 0 8px 32px var(--shadow-sm);
  opacity: 0;
  visibility: hidden;
  transform: translateX(6px);
  transition: opacity 160ms ease, transform 160ms ease, visibility 160ms;
}
.index-flyout.is-open { opacity: 1; visibility: visible; transform: translateX(0); pointer-events: auto; }
.index-flyout .toc-header { background: transparent; border-bottom: none; padding: 14px 14px 6px; }
.index-flyout .toc-title { font-size: 10px; letter-spacing: 1px; color: var(--text-muted); }
.index-flyout .toc-content { padding: 4px 8px 10px; overscroll-behavior: contain; }
.index-flyout .toc-item { border-radius: 5px; font-size: 12px; min-height: 32px; }
.index-flyout .toc-level-indicator { display: none; }
.index-flyout .toc-item.active { font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  .index-flyout, .index-trigger, .index-mark { transition: none !important; }
}
@media print { .editor-index { display: none !important; } }

.toc-panel {
  width: 260px;
  min-width: 200px;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-primary);
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
}

.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.toc-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.toc-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  background: transparent;
  border: none;
  transition: all 0.15s;
}

.toc-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.toc-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.toc-empty {
  padding: 24px 16px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
}

.toc-nav {
  display: flex;
  flex-direction: column;
}

.toc-spacer {
  flex: 0 0 auto;
  pointer-events: none;
}

.toc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.4;
  transition: all 0.12s;
  border-left: 2px solid transparent;
  min-height: 32px;
}

.toc-nav.virtualized .toc-item {
  height: 32px;
  flex: 0 0 32px;
}

.toc-item:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.toc-item.active {
  background: var(--toc-active-bg, var(--active-bg));
  color: var(--toc-active-color, var(--active-text));
  border-left-color: var(--primary);
}

.toc-level-indicator {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-faint);
  min-width: 22px;
  text-align: center;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.toc-item.active .toc-level-indicator {
  background: var(--primary);
  color: white;
}

.toc-item-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Footnotes entry */
.toc-footnotes-entry {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-primary);
  font-weight: 500;
  font-size: 12px;
  font-style: italic;
  color: var(--text-muted);
}

.toc-footnotes-entry:hover {
  color: var(--text-primary);
}

.toc-footnotes-entry .toc-level-indicator {
  font-size: 13px;
  padding: 0;
  background: transparent;
}

/* Heading level font sizes */
.toc-level-1 {
  font-weight: 600;
  font-size: 14px;
}

.toc-level-2 {
  font-weight: 500;
  font-size: 13px;
}

.toc-level-3,
.toc-level-4,
.toc-level-5,
.toc-level-6 {
  font-weight: 400;
  font-size: 12px;
}

@media print {
  .toc-panel {
    display: none !important;
  }
}
</style>
