<script setup lang="ts">
import { ref, computed, watch, onUnmounted, inject, nextTick, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { useI18n } from '../i18n';
import { SCROLL_OFFSET } from '../constants';
import { targetScrollTop } from '../utils/scroll';
import { pickActiveHeading } from '../composables/useScrollSpy';

const { t } = useI18n();
const editor = inject<Ref<Editor | null>>('editor');

interface TocItem {
  level: number;
  text: string;
  id: string;
  pos: number;
  kind?: 'heading' | 'footnotes';
}

const emit = defineEmits<{
  close: [];
}>();

const headings = ref<TocItem[]>([]);
const activeHeadingId = ref<string | null>(null);

const extractHeadings = () => {
  if (!editor?.value) {
    headings.value = [];
    return;
  }

  const items: TocItem[] = [];
  const doc = editor.value.state.doc;
  let footnotesPos: number | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level as number;
      const text = node.textContent;
      if (text.trim()) {
        items.push({ level, text, id: `toc-heading-${pos}`, pos, kind: 'heading' });
      }
    } else if (node.type.name === 'footnoteSection') {
      footnotesPos = pos;
    }
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

  headings.value = items;
};

// Compute min heading level for proper indentation (skip footnotes entry at level 0)
const minLevel = computed(() => {
  const realHeadings = headings.value.filter(h => h.kind !== 'footnotes');
  if (realHeadings.length === 0) return 1;
  return Math.min(...realHeadings.map(h => h.level));
});

const scrollContainerTo = (container: Element, target: Element) => {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = targetScrollTop(containerRect.top, targetRect.top, container.scrollTop, SCROLL_OFFSET);
  container.scrollTo({ top, behavior: 'smooth' });
};

const scrollToHeading = (item: TocItem) => {
  if (!editor?.value) return;

  // Footnotes entry: direct DOM scroll to section wrapper (atom block, no inner content)
  if (item.kind === 'footnotes') {
    // scrollIntoView:false + rAF defer keep OUR scroll authoritative — otherwise the
    // editor's own caret-into-view runs and can leave the target at the viewport
    // bottom instead of the top (issue #114).
    editor.value.commands.focus(undefined, { scrollIntoView: false });
    const container = document.querySelector('.editor-container');
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

const resolveHeadingEl = (item: TocItem): HTMLElement | null => {
  if (!editor?.value || !scrollContainer) return null;
  if (item.kind === 'footnotes') {
    return scrollContainer.querySelector<HTMLElement>('.footnote-section-wrapper');
  }
  const { node } = editor.value.view.domAtPos(item.pos + 1);
  return node instanceof HTMLElement ? node : node.parentElement;
};

const updateActiveHeading = () => {
  if (!scrollContainer || headings.value.length === 0) return;
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const tops = headings.value
    .map((h) => {
      const el = resolveHeadingEl(h);
      return el ? { id: h.id, top: el.getBoundingClientRect().top - containerTop } : null;
    })
    .filter((t): t is { id: string; top: number } => t !== null);
  const atBottom =
    scrollContainer.scrollTop + scrollContainer.clientHeight >= scrollContainer.scrollHeight - 2;
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
  scrollContainer = null;
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
};

// Update headings on editor changes
const onEditorUpdate = () => {
  extractHeadings();
};

// Watch for editor instance changes
watch(
  () => editor?.value,
  (newEditor, oldEditor) => {
    if (oldEditor) {
      oldEditor.off('update', onEditorUpdate);
      detachScrollSpy();
    }
    if (newEditor) {
      newEditor.on('update', onEditorUpdate);
      extractHeadings();
      nextTick(() => attachScrollSpy());
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  if (editor?.value) {
    editor.value.off('update', onEditorUpdate);
  }
  detachScrollSpy();
});
</script>

<template>
  <div class="toc-panel">
    <div class="toc-header">
      <h3 class="toc-title">{{ t.tableOfContents }}</h3>
      <button class="toc-close-btn" @click="emit('close')" :title="t.close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="toc-content">
      <div v-if="headings.length === 0" class="toc-empty">
        {{ t.tocEmpty }}
      </div>
      <nav v-else class="toc-nav">
        <button
          v-for="item in headings"
          :key="item.id"
          class="toc-item"
          :class="[
            `toc-level-${item.level}`,
            { active: activeHeadingId === item.id, 'toc-footnotes-entry': item.kind === 'footnotes' },
          ]"
          :style="{ paddingLeft: `${Math.max(item.level - minLevel, 0) * 16 + 12}px` }"
          @click="scrollToHeading(item)"
          :title="item.text"
        >
          <span class="toc-level-indicator">
            <template v-if="item.kind === 'footnotes'">&sect;</template>
            <template v-else>H{{ item.level }}</template>
          </span>
          <span class="toc-item-text">{{ item.text }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
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
