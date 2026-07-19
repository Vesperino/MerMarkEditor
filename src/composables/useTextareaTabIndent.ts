import type { Ref } from 'vue';
import { applyTabIndent, type TabIndentDirection } from '../utils/textTabIndent';

export interface UseTextareaTabIndentOptions {
  textareaRef: Ref<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}

function directionFromKey(event: KeyboardEvent): TabIndentDirection | null {
  if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return null;
  return event.shiftKey ? 'outdent' : 'indent';
}

export function useTextareaTabIndent({ textareaRef, onChange }: UseTextareaTabIndentOptions) {
  const handleKeydown = (event: KeyboardEvent) => {
    const direction = directionFromKey(event);
    if (!direction) return;
    const textarea = textareaRef.value;
    if (!textarea) return;
    event.preventDefault();

    const result = applyTabIndent({
      text: textarea.value,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      direction,
    });
    if (!result) return;

    onChange(result.text);
    queueMicrotask(() => {
      const el = textareaRef.value;
      if (!el) return;
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return { handleKeydown };
}
