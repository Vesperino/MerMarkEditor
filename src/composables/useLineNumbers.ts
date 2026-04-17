import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

export interface LineEntry {
  top: number;
  num: number;
}

interface UseLineNumbersOptions {
  containerRef: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
}

const MIN_LINE_HEIGHT_PX = 4;

export function useLineNumbers({ containerRef, enabled }: UseLineNumbersOptions) {
  const lines = ref<LineEntry[]>([]);

  let resizeObserver: ResizeObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let rafHandle: number | null = null;

  const scheduleRecompute = () => {
    if (rafHandle !== null) return;
    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;
      recompute();
    });
  };

  const recompute = () => {
    const container = containerRef.value;
    if (!container) {
      lines.value = [];
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const entries: LineEntry[] = [];
    let counter = 1;

    for (const child of Array.from(container.children) as HTMLElement[]) {
      const rect = child.getBoundingClientRect();
      if (rect.height === 0) continue;

      const topInContainer = rect.top - containerRect.top;
      const lineCount = countLinesForBlock(child, rect.height);
      const step = lineCount > 0 ? rect.height / lineCount : rect.height;

      for (let i = 0; i < lineCount; i++) {
        entries.push({
          top: topInContainer + i * step,
          num: counter++,
        });
      }
    }

    lines.value = entries;
  };

  const countLinesForBlock = (el: HTMLElement, height: number): number => {
    if (isAtomicBlock(el)) return 1;

    if (el.tagName === 'PRE') {
      const textLines = (el.textContent ?? '').split('\n').length;
      return Math.max(1, textLines);
    }

    if (el.tagName === 'TABLE') {
      return Math.max(1, el.querySelectorAll('tr').length);
    }

    const lineHeightPx = resolveLineHeightPx(el);
    if (lineHeightPx < MIN_LINE_HEIGHT_PX) return 1;
    return Math.max(1, Math.round(height / lineHeightPx));
  };

  const attach = () => {
    const container = containerRef.value;
    if (!container) return;

    resizeObserver = new ResizeObserver(scheduleRecompute);
    resizeObserver.observe(container);
    for (const child of Array.from(container.children)) {
      resizeObserver.observe(child);
    }

    mutationObserver = new MutationObserver(() => {
      if (resizeObserver) {
        for (const child of Array.from(container.children)) {
          resizeObserver.observe(child);
        }
      }
      scheduleRecompute();
    });
    mutationObserver.observe(container, { childList: true, subtree: false, characterData: true });

    scheduleRecompute();
  };

  const detach = () => {
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    resizeObserver = null;
    mutationObserver = null;
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    lines.value = [];
  };

  watch([containerRef, enabled], ([container, isEnabled]) => {
    detach();
    if (isEnabled && container) attach();
  }, { immediate: true });

  onBeforeUnmount(detach);

  return { lines, recompute: scheduleRecompute };
}

function isAtomicBlock(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === 'IMG' || tag === 'HR') return true;
  if (el.getAttribute('data-type') === 'mermaid') return true;
  if (el.querySelector(':scope > img.editor-image')) return true;
  return false;
}

function resolveLineHeightPx(el: HTMLElement): number {
  const computed = window.getComputedStyle(el);
  const raw = computed.lineHeight;
  const parsed = parseFloat(raw);
  if (!Number.isNaN(parsed) && raw.endsWith('px')) return parsed;

  const fontSize = parseFloat(computed.fontSize) || 16;
  if (raw === 'normal') return fontSize * 1.2;
  if (!Number.isNaN(parsed)) return parsed * fontSize;
  return fontSize * 1.6;
}
