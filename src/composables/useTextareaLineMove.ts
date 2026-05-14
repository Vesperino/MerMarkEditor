import type { Ref } from 'vue';
import { moveSelectedLines, type LineMoveDirection } from '../utils/textLineMover';

export interface UseTextareaLineMoveOptions {
  textareaRef: Ref<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

function directionFromKey(event: KeyboardEvent): LineMoveDirection | null {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'ArrowUp') return 'up';
  if (event.key === 'ArrowDown') return 'down';
  return null;
}

export function useTextareaLineMove({ textareaRef, onChange }: UseTextareaLineMoveOptions) {
  const handleKeydown = (event: KeyboardEvent) => {
    const direction = directionFromKey(event);
    if (!direction) return;
    const textarea = textareaRef.value;
    if (!textarea) return;

    const result = moveSelectedLines({
      text: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      direction,
    });
    if (!result) return;

    event.preventDefault();
    onChange(result.text);
    // Restore selection after Vue propagates the new value.
    queueMicrotask(() => {
      const el = textareaRef.value;
      if (!el) return;
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return { handleKeydown };
}
