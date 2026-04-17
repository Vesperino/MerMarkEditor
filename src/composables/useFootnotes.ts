import { ref, nextTick, onMounted, onBeforeUnmount, watch, type Ref } from 'vue';
import type { Editor as VueEditor } from '@tiptap/vue-3';
import type { Editor as CoreEditor } from '@tiptap/core';
import type { FootnoteDefinition } from '../utils/footnote-utils';

// Accept either @tiptap/vue-3 or @tiptap/core Editor (onUpdate passes the core variant)
type AnyEditor = VueEditor | CoreEditor;

interface FootnoteStorage {
  pendingPopoverLabel: string | null;
}

export interface FootnoteTooltipState {
  visible: boolean;
  content: string;
  x: number;
  y: number;
}

export interface FootnotePopoverState {
  visible: boolean;
  label: string;
  content: string;
  x: number;
  y: number;
}

const POPOVER_RETRY_MAX = 10;
const POPOVER_RETRY_INTERVAL_MS = 30;
const HIGHLIGHT_DURATION_MS = 3000;

/**
 * Footnote interactions: hover tooltip + click popover + auto-open after insert.
 * Keeps Editor.vue free of footnote-specific glue.
 */
export function useFootnotes(
  editor: Ref<AnyEditor | null | undefined>,
  containerRef: Ref<HTMLElement | null>,
) {
  const tooltip = ref<FootnoteTooltipState>({ visible: false, content: '', x: 0, y: 0 });
  const popover = ref<FootnotePopoverState>({ visible: false, label: '', content: '', x: 0, y: 0 });
  const popoverRef = ref<HTMLDivElement | null>(null);

  // --- content lookup ---

  const getDefinition = (label: string): FootnoteDefinition | null => {
    if (!editor.value) return null;
    let found: FootnoteDefinition | null = null;
    editor.value.state.doc.descendants((node) => {
      if (found) return false;
      if (node.type.name === 'footnoteSection') {
        try {
          const defs: FootnoteDefinition[] = JSON.parse(node.attrs.definitions || '[]');
          found = defs.find(d => d.label === label) || null;
        } catch { /* ignore */ }
        return false;
      }
    });
    return found;
  };

  const getContent = (label: string): string => getDefinition(label)?.content || '';

  // --- positioning ---

  const relativeTo = (rect: DOMRect) => {
    const containerRect = containerRef.value?.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - (containerRect?.left || 0),
      y: rect.top - (containerRect?.top || 0),
    };
  };

  // --- tooltip ---

  const showTooltip = (label: string, anchor: HTMLElement) => {
    if (popover.value.visible) return;
    const display = getContent(label) || '(click to edit)';
    const { x, y } = relativeTo(anchor.getBoundingClientRect());
    tooltip.value = {
      visible: true,
      content: `[^${label}]: ${display}`,
      x,
      y: y - 4,
    };
  };

  const hideTooltip = () => { tooltip.value.visible = false; };

  // --- popover ---

  const showPopover = (label: string, anchor: HTMLElement) => {
    hideTooltip();
    const rect = anchor.getBoundingClientRect();
    const { x, y } = relativeTo(rect);
    popover.value = {
      visible: true,
      label,
      content: getContent(label),
      x,
      y: y - 8,
    };
    nextTick(() => {
      const textarea = popoverRef.value?.querySelector('textarea');
      textarea?.focus();
    });
  };

  const showPopoverByLabel = (label: string, attempt = 0): void => {
    const container = containerRef.value;
    if (!container) return;
    const sup = container.querySelector(
      `sup.footnote-ref[data-footnote-ref="${label}"]`,
    ) as HTMLElement | null;
    if (sup) {
      showPopover(label, sup);
    } else if (attempt < POPOVER_RETRY_MAX) {
      setTimeout(() => showPopoverByLabel(label, attempt + 1), POPOVER_RETRY_INTERVAL_MS);
    }
  };

  const updateDefinitionContent = (label: string, newContent: string) => {
    if (!editor.value) return;
    let done = false;
    editor.value.state.doc.descendants((node, pos) => {
      if (done) return false;
      if (node.type.name === 'footnoteSection') {
        done = true;
        try {
          const defs: FootnoteDefinition[] = JSON.parse(node.attrs.definitions || '[]');
          const def = defs.find(d => d.label === label);
          if (def) {
            def.content = newContent;
            const tr = editor.value!.state.tr;
            tr.setNodeMarkup(pos, undefined, { definitions: JSON.stringify(defs) });
            editor.value!.view.dispatch(tr);
          }
        } catch { /* ignore */ }
        return false;
      }
    });
  };

  const savePopover = () => {
    if (!popover.value.visible) return;
    updateDefinitionContent(popover.value.label, popover.value.content);
    popover.value.visible = false;
  };

  const closePopover = () => { popover.value.visible = false; };

  const handlePopoverKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      savePopover();
    } else if (e.key === 'Escape') {
      closePopover();
    }
  };

  // --- event delegation helpers ---

  const isFootnoteRef = (el: HTMLElement): boolean =>
    el.tagName === 'SUP' && el.classList.contains('footnote-ref');

  const handleMouseOver = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!isFootnoteRef(target)) return;
    const label = target.getAttribute('data-footnote-ref');
    if (label) showTooltip(label, target);
  };

  const handleMouseOut = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (isFootnoteRef(target)) hideTooltip();
  };

  /** Returns true if the click was handled (caller should skip further processing). */
  const handleClick = (event: MouseEvent): boolean => {
    const target = event.target as HTMLElement;
    // Auto-save popover on outside click
    if (popover.value.visible) {
      const popoverEl = popoverRef.value;
      if (popoverEl && !popoverEl.contains(target)) {
        savePopover();
      }
    }
    if (isFootnoteRef(target)) {
      event.preventDefault();
      event.stopPropagation();
      const label = target.getAttribute('data-footnote-ref');
      if (label) showPopover(label, target);
      return true;
    }
    return false;
  };

  /** Call from editor onUpdate: opens popover if toolbar just inserted a footnote. */
  const consumePendingInsert = (ed: AnyEditor) => {
    const storage = (ed.storage as unknown as Record<string, FootnoteStorage | undefined>).footnoteSection;
    const pendingLabel = storage?.pendingPopoverLabel;
    if (pendingLabel && storage) {
      storage.pendingPopoverLabel = null;
      nextTick(() => showPopoverByLabel(pendingLabel));
    }
  };

  // --- navigation ---

  const flashElement = (el: HTMLElement) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('footnote-highlight');
    setTimeout(() => el.classList.remove('footnote-highlight'), HIGHLIGHT_DURATION_MS);
  };

  const highlightDefinition = (label: string) => {
    const item = containerRef.value?.querySelector(
      `.footnote-item[data-footnote-label="${label}"]`,
    ) as HTMLElement | null;
    if (item) flashElement(item);
  };

  const highlightRef = (label: string) => {
    const sup = containerRef.value?.querySelector(
      `sup.footnote-ref[data-footnote-ref="${label}"]`,
    ) as HTMLElement | null;
    if (sup) flashElement(sup);
  };

  // Backlink event from FootnoteNode: scroll+flash the referenced sup
  const handleBacklink = (e: Event) => {
    const label = (e as CustomEvent<{ label: string }>).detail?.label;
    if (label) highlightRef(label);
  };

  // Register/unregister backlink listener on container (reactively tracks ref changes)
  let currentContainer: HTMLElement | null = null;
  const bindContainer = (el: HTMLElement | null) => {
    if (currentContainer === el) return;
    if (currentContainer) {
      currentContainer.removeEventListener('mermark-footnote-backlink', handleBacklink);
    }
    currentContainer = el;
    if (currentContainer) {
      currentContainer.addEventListener('mermark-footnote-backlink', handleBacklink);
    }
  };

  onMounted(() => bindContainer(containerRef.value));
  watch(containerRef, (el) => bindContainer(el));
  onBeforeUnmount(() => bindContainer(null));

  return {
    // state
    tooltip,
    popover,
    popoverRef,
    // popover actions (template refs)
    savePopover,
    closePopover,
    handlePopoverKeydown,
    // event delegation (Editor.vue bindings)
    handleMouseOver,
    handleMouseOut,
    handleClick,
    consumePendingInsert,
    // navigation
    highlightDefinition,
    highlightRef,
  };
}
