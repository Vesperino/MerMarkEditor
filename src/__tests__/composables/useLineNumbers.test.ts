import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import { useLineNumbers } from '../../composables/useLineNumbers';

type RectStub = { top: number; height: number; left: number; right: number; bottom: number; width: number };

function stubChild(tag: string, rect: RectStub, opts: { text?: string; attrs?: Record<string, string>; rowCount?: number; lineHeight?: string } = {}): HTMLElement {
  const el = document.createElement(tag);
  if (opts.text) el.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  if (opts.rowCount && tag.toLowerCase() === 'table') {
    const tbody = document.createElement('tbody');
    for (let i = 0; i < opts.rowCount; i++) tbody.appendChild(document.createElement('tr'));
    el.appendChild(tbody);
  }
  el.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect;

  const cs = { lineHeight: opts.lineHeight ?? '20px', fontSize: '16px' } as CSSStyleDeclaration;
  Object.defineProperty(el, '__mockCs', { value: cs });
  return el;
}

function mountContainer(children: HTMLElement[], containerRect: RectStub, containerLineHeight = '20px'): HTMLElement {
  const container = document.createElement('div');
  for (const c of children) container.appendChild(c);
  container.getBoundingClientRect = () => ({ ...containerRect, x: containerRect.left, y: containerRect.top, toJSON: () => ({}) }) as DOMRect;
  const cs = { lineHeight: containerLineHeight, fontSize: '16px' } as CSSStyleDeclaration;
  Object.defineProperty(container, '__mockCs', { value: cs });
  document.body.appendChild(container);
  return container;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
    const mocked = (el as unknown as { __mockCs?: CSSStyleDeclaration }).__mockCs;
    return mocked ?? ({ lineHeight: '20px', fontSize: '16px' } as CSSStyleDeclaration);
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

describe('useLineNumbers', () => {
  it('returns empty when disabled', async () => {
    const container = mountContainer([
      stubChild('p', { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 }),
    ], { top: 0, height: 100, left: 0, right: 100, bottom: 100, width: 100 });

    const containerRef = ref<HTMLElement | null>(container);
    const enabled = ref(false);
    const { lines } = useLineNumbers({ containerRef, enabled });
    await nextTick();

    expect(lines.value).toEqual([]);
  });

  it('counts one line per single-line paragraph', async () => {
    const p1 = stubChild('p', { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 });
    const p2 = stubChild('p', { top: 20, height: 20, left: 0, right: 100, bottom: 40, width: 100 });
    const container = mountContainer([p1, p2], { top: 0, height: 40, left: 0, right: 100, bottom: 40, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.map((l) => l.num)).toEqual([1, 2]);
    expect(lines.value[0].top).toBe(0);
    expect(lines.value[1].top).toBe(20);
  });

  it('splits wrapped block into multiple lines by height', async () => {
    const wrapped = stubChild('p', { top: 0, height: 60, left: 0, right: 100, bottom: 60, width: 100 }, { text: 'long wrapped paragraph' });
    const container = mountContainer([wrapped], { top: 0, height: 60, left: 0, right: 100, bottom: 60, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(3);
    expect(lines.value.map((l) => l.num)).toEqual([1, 2, 3]);
  });

  it('normalizes small text-rect variance to the computed line height', async () => {
    const wrapped = stubChild('p', { top: 0, height: 50, left: 0, right: 100, bottom: 50, width: 100 }, {
      text: 'wrapped paragraph',
      lineHeight: '24px',
    });
    const container = mountContainer([wrapped], { top: 0, height: 50, left: 0, right: 100, bottom: 50, width: 100 });

    vi.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents() {},
      getClientRects: () => ([
        { top: 0, height: 25, left: 0, right: 100, bottom: 25, width: 100 },
        { top: 24.5, height: 24.8, left: 0, right: 100, bottom: 49.3, width: 100 },
      ].map((rect) => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) }) as DOMRect)),
      detach() {},
    }) as unknown as Range);

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value).toHaveLength(2);
    expect(lines.value.map((line) => line.height)).toEqual([24, 24]);
    expect(lines.value.map((line) => Number(line.top.toFixed(2)))).toEqual([0.5, 24.5]);
  });

  it('counts PRE by text-content newlines, not height', async () => {
    const pre = stubChild('pre', { top: 0, height: 200, left: 0, right: 100, bottom: 200, width: 100 }, {
      text: 'line1\nline2\nline3\nline4',
    });
    const container = mountContainer([pre], { top: 0, height: 200, left: 0, right: 100, bottom: 200, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(4);
  });

  it('counts TABLE by tr count', async () => {
    const table = stubChild('table', { top: 0, height: 120, left: 0, right: 100, bottom: 120, width: 100 }, { rowCount: 3 });
    const container = mountContainer([table], { top: 0, height: 120, left: 0, right: 100, bottom: 120, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(3);
  });

  it('counts table rows when TipTap wraps the table in tableWrapper', async () => {
    const wrapper = stubChild('div', { top: 0, height: 160, left: 0, right: 100, bottom: 160, width: 100 }, {
      attrs: { class: 'tableWrapper' },
    });
    const table = stubChild('table', { top: 0, height: 160, left: 0, right: 100, bottom: 160, width: 100 }, { rowCount: 4 });
    wrapper.appendChild(table);

    const rows = Array.from(table.querySelectorAll('tr')) as HTMLElement[];
    rows.forEach((row, index) => {
      const top = index * 40;
      row.getBoundingClientRect = () => ({
        top,
        height: 40,
        left: 0,
        right: 100,
        bottom: top + 40,
        width: 100,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    });

    const container = mountContainer([wrapper], { top: 0, height: 160, left: 0, right: 100, bottom: 160, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value).toHaveLength(4);
    expect(lines.value.map((line) => line.top)).toEqual([0, 40, 80, 120]);
  });

  it('counts atomic mermaid block as one line', async () => {
    const mermaid = stubChild('div', { top: 0, height: 300, left: 0, right: 100, bottom: 300, width: 100 }, { attrs: { 'data-type': 'mermaid' } });
    const container = mountContainer([mermaid], { top: 0, height: 300, left: 0, right: 100, bottom: 300, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(1);
  });

  it('counts small empty block as one line', async () => {
    const emptySmall = stubChild('p', { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 });
    const container = mountContainer([emptySmall], { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(1);
  });

  it('suppresses empty structural block with oversize height', async () => {
    const emptyTall = stubChild('div', { top: 0, height: 200, left: 0, right: 100, bottom: 200, width: 100 });
    const container = mountContainer([emptyTall], { top: 0, height: 200, left: 0, right: 100, bottom: 200, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(0);
  });

  it('skips zero-height children', async () => {
    const visible = stubChild('p', { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 });
    const hidden = stubChild('p', { top: 0, height: 0, left: 0, right: 100, bottom: 0, width: 100 });
    const container = mountContainer([visible, hidden], { top: 0, height: 20, left: 0, right: 100, bottom: 20, width: 100 });

    const { lines } = useLineNumbers({ containerRef: ref(container), enabled: ref(true) });
    await nextTick();

    expect(lines.value.length).toBe(1);
  });
});
