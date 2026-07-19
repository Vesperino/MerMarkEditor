import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useTextareaTabIndent } from '../../composables/useTextareaTabIndent';

function setup(text: string, selectionStart: number, selectionEnd: number) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setSelectionRange(selectionStart, selectionEnd);
  const textareaRef = ref<HTMLTextAreaElement | null>(textarea);
  const onChange = vi.fn((value: string) => {
    textarea.value = value;
  });
  const { handleKeydown } = useTextareaTabIndent({ textareaRef, onChange });

  return { textarea, onChange, handleKeydown };
}

describe('useTextareaTabIndent', () => {
  it('handles Tab and restores the resulting caret', async () => {
    const { textarea, onChange, handleKeydown } = setup('abc', 1, 1);
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });

    handleKeydown(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith('a\tbc');
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(2);
  });

  it('handles Shift+Tab when indentation can be removed', async () => {
    const { textarea, onChange, handleKeydown } = setup('    abc', 7, 7);
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });

    handleKeydown(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledWith('abc');
    expect(textarea.selectionStart).toBe(3);
    expect(textarea.selectionEnd).toBe(3);
  });

  it('leaves modified Tab combinations untouched', () => {
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      const { onChange, handleKeydown } = setup('abc', 1, 1);
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        [modifier]: true,
        cancelable: true,
      });

      handleKeydown(event);

      expect(event.defaultPrevented).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    }
  });

  it('prevents Shift+Tab without changing text when there is nothing to outdent', () => {
    const { onChange, handleKeydown } = setup('abc', 1, 1);
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });

    handleKeydown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });
});
