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
  diffTitle: Ref<string>;
  canShowDiff: ComputedRef<boolean>;
  openDiffPreview: () => void;
  openComparePreview: (leftMarkdown: string, rightMarkdown: string, leftName?: string, rightName?: string) => void;
  closeDiffPreview: () => void;
}

export interface DiffHunk {
  id: number;
  type: 'unchanged' | 'change';
  lines: DiffLine[];
}

/** Groups flat DiffLine[] into hunks of consecutive unchanged or changed lines. */
export function splitIntoHunks(diffLines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let hunkId = 0;
  let current: DiffHunk | null = null;

  for (const line of diffLines) {
    const type = line.type === 'unchanged' ? 'unchanged' : 'change';
    if (!current || current.type !== type) {
      current = { id: hunkId++, type, lines: [] };
      hunks.push(current);
    }
    current.lines.push(line);
  }

  return hunks;
}

/**
 * Reconstructs text from hunk selections.
 * acceptedIds = set of change-hunk IDs whose external (added) lines should be kept.
 * Rejected change hunks fall back to original (removed) lines.
 */
export function applyHunkSelections(hunks: DiffHunk[], acceptedIds: Set<number>): string {
  const lines: string[] = [];
  for (const hunk of hunks) {
    if (hunk.type === 'unchanged') {
      for (const line of hunk.lines) lines.push(line.content);
    } else if (acceptedIds.has(hunk.id)) {
      for (const line of hunk.lines) {
        if (line.type === 'added') lines.push(line.content);
      }
    } else {
      for (const line of hunk.lines) {
        if (line.type === 'removed') lines.push(line.content);
      }
    }
  }
  return lines.join('\n');
}

export function generateDiff(oldText: string, newText: string): { lines: DiffLine[]; stats: DiffStats } {
  const normalizedOld = oldText.replace(/\r\n/g, '\n');
  const normalizedNew = newText.replace(/\r\n/g, '\n');

  const changes = diffLines(normalizedOld, normalizedNew);

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

  return { lines, stats: { additions: addCount, deletions: removeCount } };
}

export function useDiffPreview(options: UseDiffPreviewOptions): UseDiffPreviewReturn {
  const { originalMarkdown, getCurrentMarkdown, hasChanges } = options;

  const showDiffPreview = ref(false);
  const diffPreviewLines = ref<DiffLine[]>([]);
  const diffStats = ref<DiffStats>({ additions: 0, deletions: 0 });
  const diffTitle = ref('');

  const canShowDiff = computed(() => {
    return hasChanges.value && originalMarkdown.value !== null;
  });

  const openDiffPreview = () => {
    const original = originalMarkdown.value || '';
    const current = getCurrentMarkdown();
    const result = generateDiff(original, current);

    diffPreviewLines.value = result.lines;
    diffStats.value = result.stats;
    diffTitle.value = '';
    showDiffPreview.value = true;
  };

  const openComparePreview = (leftMarkdown: string, rightMarkdown: string, leftName?: string, rightName?: string) => {
    const result = generateDiff(leftMarkdown, rightMarkdown);

    diffPreviewLines.value = result.lines;
    diffStats.value = result.stats;
    diffTitle.value = leftName && rightName ? `${leftName} ↔ ${rightName}` : '';
    showDiffPreview.value = true;
  };

  const closeDiffPreview = () => {
    showDiffPreview.value = false;
    diffPreviewLines.value = [];
    diffStats.value = { additions: 0, deletions: 0 };
    diffTitle.value = '';
  };

  return {
    showDiffPreview,
    diffPreviewLines,
    diffStats,
    diffTitle,
    canShowDiff,
    openDiffPreview,
    openComparePreview,
    closeDiffPreview,
  };
}
