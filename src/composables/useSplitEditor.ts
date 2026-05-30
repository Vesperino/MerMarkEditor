import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';

const PREVIEW_DEBOUNCE_MS = 200;

const splitEditorActive = ref<boolean>(false);

export interface UseSplitEditorReturn {
  splitEditorActive: Ref<boolean>;
  markdownSource: Ref<string>;
  previewHtml: ComputedRef<string>;
  enter: (html: string) => void;
  exit: () => string;
  onMarkdownInput: (value: string) => void;
  syncFromVisual: (html: string) => void;
}

export function useSplitEditor(): UseSplitEditorReturn {
  const markdownSource = ref('');
  const debouncedSource = ref('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const previewHtml = computed(() => markdownToHtml(debouncedSource.value));

  const enter = (html: string): void => {
    const md = htmlToMarkdown(html);
    markdownSource.value = md;
    debouncedSource.value = md;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const exit = (): string => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    debouncedSource.value = markdownSource.value;
    return markdownToHtml(markdownSource.value);
  };

  const onMarkdownInput = (value: string): void => {
    markdownSource.value = value;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedSource.value = markdownSource.value;
      debounceTimer = null;
    }, PREVIEW_DEBOUNCE_MS);
  };

  // Visual → code, for in-preview node edits only (e.g. editing a Mermaid
  // diagram via AI/manual). Caller gates this on the preview editor's real-edit
  // signal, so the code→visual push echo never reaches here. debouncedSource /
  // previewHtml are left untouched so the preview isn't re-rendered mid-edit.
  const syncFromVisual = (html: string): void => {
    const md = htmlToMarkdown(html);
    if (md === markdownSource.value) return;
    markdownSource.value = md;
  };

  return {
    splitEditorActive,
    markdownSource,
    previewHtml,
    enter,
    exit,
    onMarkdownInput,
    syncFromVisual,
  };
}
