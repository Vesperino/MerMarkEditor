import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
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

describe('CodeEditor gutter cap (issue #129)', () => {
  it('renders the gutter for normal documents', () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: 'a\nb\nc' } });
    expect(wrapper.find('.code-editor-gutter').exists()).toBe(true);
    expect(wrapper.classes()).toContain('has-line-numbers');
  });

  it('suppresses the gutter above GUTTER_MAX_LINES', () => {
    const big = Array.from({ length: 10_001 }, (_, i) => String(i)).join('\n');
    const wrapper = mount(CodeEditor, { props: { modelValue: big } });
    expect(wrapper.find('.code-editor-gutter').exists()).toBe(false);
    expect(wrapper.classes()).not.toContain('has-line-numbers');
  });
});
