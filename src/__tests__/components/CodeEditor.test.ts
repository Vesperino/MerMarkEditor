import { describe, it, expect, vi, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

beforeAll(() => {
  Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
  Range.prototype.getBoundingClientRect = vi.fn(() => new DOMRect());
});

import CodeEditor from '../../components/CodeEditor.vue';

vi.mock('../../composables/useSettings', () => ({
  useSettings: () => ({
    settings: ref({
      codeWordWrap: false,
      showLineNumbers: true,
      codeFontFamily: 'monospace',
    }),
  }),
}));

vi.mock('../../composables/useEditorZoom', () => ({
  useEditorZoom: () => ({ zoomScale: ref(1) }),
}));

describe('CodeEditor virtualization (issue #129)', () => {
  it('exposes the complete editable document through the editor handle', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'a\nb\nc' } });
    await nextTick();

    const handle = (wrapper.vm as unknown as { editor: { getValue: () => string } }).editor;
    expect(handle.getValue()).toBe('a\nb\nc');
    expect(wrapper.find('.cm-gutters').exists()).toBe(true);
  });

  it('does not create one DOM line per line of a 3 MB document', async () => {
    const line = '# Large file line with enough text to exercise viewport rendering\n';
    const big = line.repeat(Math.ceil((3 * 1024 * 1024) / line.length));
    const wrapper = mount(CodeEditor, { props: { modelValue: big } });
    await nextTick();

    const renderedLines = wrapper.findAll('.cm-line').length;
    expect(renderedLines).toBeGreaterThan(0);
    expect(renderedLines).toBeLessThan(100);
    const handle = (wrapper.vm as unknown as { editor: { getValue: () => string } }).editor;
    expect(handle.getValue().length).toBe(big.length);
  });
});
