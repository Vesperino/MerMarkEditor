import { ref, watch, onBeforeUnmount, type Ref } from 'vue';

export interface LineEntry {
  top: number;
  num: number;
  height: number;
}

interface UseLineNumbersOptions {
  containerRef: Ref<HTMLElement | null>;
  enabled: Ref<boolean>;
}

interface LineRect {
  top: number;
  height: number;
}

const MIN_LINE_HEIGHT_PX = 4;
const SAME_ROW_THRESHOLD_PX = 2;

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

      const lineRects = getLinesForBlock(child, rect);
      for (const lr of lineRects) {
        entries.push({
          top: lr.top - containerRect.top,
          num: counter++,
          height: lr.height,
        });
      }
    }

    lines.value = entries;
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

function getLinesForBlock(el: HTMLElement, rect: DOMRect): LineRect[] {
  if (isAtomicBlock(el)) {
    return [{ top: rect.top, height: rect.height }];
  }

  if (el.tagName === 'TABLE') {
    return getTableRowRects(el, rect);
  }

  if (el.tagName === 'PRE') {
    return getPreLineRects(el, rect);
  }

  if ((el.textContent ?? '').trim() === '') {
    return [{ top: rect.top, height: rect.height }];
  }

  const textRects = getTextLineRects(el);
  if (textRects.length > 0) return textRects;

  return fallbackLineRects(el, rect);
}

function getTableRowRects(table: HTMLElement, tableRect: DOMRect): LineRect[] {
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLElement[];
  if (rows.length === 0) return [{ top: tableRect.top, height: tableRect.height }];

  const measured = rows
    .map((tr) => tr.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => ({ top: r.top, height: r.height }));
  if (measured.length === rows.length) return measured;

  const step = tableRect.height / rows.length;
  return rows.map((_, i) => ({ top: tableRect.top + i * step, height: step }));
}

function getPreLineRects(pre: HTMLElement, rect: DOMRect): LineRect[] {
  const textLines = Math.max(1, (pre.textContent ?? '').split('\n').length);
  const step = rect.height / textLines;
  const out: LineRect[] = [];
  for (let i = 0; i < textLines; i++) {
    out.push({ top: rect.top + i * step, height: step });
  }
  return out;
}

function getTextLineRects(el: HTMLElement): LineRect[] {
  if (!el.firstChild || typeof document.createRange !== 'function') return [];
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    const raw = Array.from(range.getClientRects()).filter((r) => r.height > 0 && r.width > 0);
    range.detach?.();
    return mergeSameRow(raw);
  } catch {
    return [];
  }
}

function mergeSameRow(rects: DOMRect[]): LineRect[] {
  if (rects.length === 0) return [];
  const sorted = [...rects].sort((a, b) => a.top - b.top);
  const merged: LineRect[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.top - r.top) < SAME_ROW_THRESHOLD_PX) {
      if (r.height > last.height) last.height = r.height;
    } else {
      merged.push({ top: r.top, height: r.height });
    }
  }
  return merged;
}

function fallbackLineRects(el: HTMLElement, rect: DOMRect): LineRect[] {
  const lineHeightPx = resolveLineHeightPx(el);
  if (lineHeightPx < MIN_LINE_HEIGHT_PX) {
    return [{ top: rect.top, height: rect.height }];
  }
  const count = Math.max(1, Math.round(rect.height / lineHeightPx));
  const step = rect.height / count;
  const out: LineRect[] = [];
  for (let i = 0; i < count; i++) {
    out.push({ top: rect.top + i * step, height: step });
  }
  return out;
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
