import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

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

import CodeEditor from '../../components/CodeEditor.vue';

describe('CodeEditor syntax overlay (#128)', () => {
  it('renders highlighted Markdown while retaining a native textarea', () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: '# Heading\n\n- item' } });

    expect(wrapper.find('pre.code-highlight').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('.hljs-section').text()).toBe('# Heading');
    expect(wrapper.find('.hljs-bullet').text()).toBe('-');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value)
      .toBe('# Heading\n\n- item');
  });

  it('keeps overlay and gutter scroll positions synchronized', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: '# Heading\n- item' } });
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement;
    textarea.scrollTop = 42;
    textarea.scrollLeft = 17;

    await wrapper.get('textarea').trigger('scroll');

    expect((wrapper.get('pre.code-highlight').element as HTMLElement).scrollTop).toBe(42);
    expect((wrapper.get('pre.code-highlight').element as HTMLElement).scrollLeft).toBe(17);
    expect((wrapper.get('.code-editor-gutter').element as HTMLElement).scrollTop).toBe(42);
  });

  it('continues to emit native textarea edits', async () => {
    const wrapper = mount(CodeEditor, { props: { modelValue: '# old' } });
    await wrapper.get('textarea').setValue('# new');

    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['# new']);
  });
});
