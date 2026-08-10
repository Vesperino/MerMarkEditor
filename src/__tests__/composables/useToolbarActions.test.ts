import { describe, it, expect, vi } from 'vitest';
import { defineComponent, h, provide, ref, nextTick, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import type { Editor } from '@tiptap/vue-3';

vi.mock('../../utils/markdown-converter', () => ({
  htmlToMarkdown: vi.fn(() => {
    throw new Error('htmlToMarkdown must not run for toolbar token counting (issue #129 hang)');
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { useToolbarActions } from '../../composables/useToolbarActions';
import { htmlToMarkdown } from '../../utils/markdown-converter';

function makeFakeEditor() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    on: vi.fn((event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    }),
    off: vi.fn(),
    getText: vi.fn(() => 'plain document text'),
    getHTML: vi.fn(() => '<p>plain document text</p>'),
    isActive: vi.fn(() => false),
    fire: (event: string) => listeners[event]?.forEach((cb) => cb()),
  };
}

function mountWithEditor(editorRef: Ref<unknown>) {
  const Child = defineComponent({
    setup() {
      useToolbarActions();
      return () => h('div');
    },
  });
  const Parent = defineComponent({
    setup() {
      provide('editor', editorRef);
      return () => h(Child);
    },
  });
  return mount(Parent);
}

describe('useToolbarActions token counting (issue #129)', () => {
  it('primes the token counter from getText, never htmlToMarkdown(getHTML)', async () => {
    const editor = makeFakeEditor();
    const editorRef = ref<unknown>(null);
    mountWithEditor(editorRef);

    editorRef.value = editor as unknown as Editor;
    await nextTick();

    expect(editor.on).toHaveBeenCalledWith('update', expect.any(Function));
    expect(editor.getText).toHaveBeenCalled();
    expect(htmlToMarkdown).not.toHaveBeenCalled();
  });

  it('recounts on editor updates without converting the document', async () => {
    const editor = makeFakeEditor();
    const editorRef = ref<unknown>(null);
    mountWithEditor(editorRef);

    editorRef.value = editor as unknown as Editor;
    await nextTick();
    editor.getText.mockClear();

    editor.fire('update');

    expect(editor.getText).toHaveBeenCalledTimes(1);
    expect(htmlToMarkdown).not.toHaveBeenCalled();
  });
});
