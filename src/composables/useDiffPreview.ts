import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { diffLines } from 'diff';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface UseDiffPreviewOptions {
  originalMarkdown: ComputedRef<string | null>;
  getCurrentMarkdown: () => string;
  hasChanges: ComputedRef<boolean>;
}

export interface UseDiffPreviewReturn {
  showDiffPreview: Ref<boolean>;
  diffPreviewLines: Ref<DiffLine[]>;
  diffStats: Ref<DiffStats>;
  canShowDiff: ComputedRef<boolean>;
  openDiffPreview: () => void;
  closeDiffPreview: () => void;
}

export function useDiffPreview(options: UseDiffPreviewOptions): UseDiffPreviewReturn {
  const { originalMarkdown, getCurrentMarkdown, hasChanges } = options;

  const showDiffPreview = ref(false);
  const diffPreviewLines = ref<DiffLine[]>([]);
  const diffStats = ref<DiffStats>({ additions: 0, deletions: 0 });

  const canShowDiff = computed(() => {
    return hasChanges.value && originalMarkdown.value !== null;
  });

  const openDiffPreview = () => {
    const original = (originalMarkdown.value || '').replace(/\r\n/g, '\n');
    const current = getCurrentMarkdown().replace(/\r\n/g, '\n');

    const changes = diffLines(original, current);

    const lines: DiffLine[] = [];
    let oldLine = 1;
    let newLine = 1;
    let addCount = 0;
    let removeCount = 0;

    for (const change of changes) {
      const changeLines = change.value.replace(/\n$/, '').split('\n');

      for (const line of changeLines) {
        if (change.added) {
          lines.push({ type: 'added', content: line, oldLineNumber: null, newLineNumber: newLine++ });
          addCount++;
        } else if (change.removed) {
          lines.push({ type: 'removed', content: line, oldLineNumber: oldLine++, newLineNumber: null });
          removeCount++;
        } else {
          lines.push({ type: 'unchanged', content: line, oldLineNumber: oldLine++, newLineNumber: newLine++ });
        }
      }
    }

    diffPreviewLines.value = lines;
    diffStats.value = { additions: addCount, deletions: removeCount };
    showDiffPreview.value = true;
  };

  const closeDiffPreview = () => {
    showDiffPreview.value = false;
    diffPreviewLines.value = [];
    diffStats.value = { additions: 0, deletions: 0 };
  };

  return {
    showDiffPreview,
    diffPreviewLines,
    diffStats,
    canShowDiff,
    openDiffPreview,
    closeDiffPreview,
  };
}
