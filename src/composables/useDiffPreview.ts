import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { diffLines, diffWordsWithSpace } from 'diff';

export interface DiffSegment {
  value: string;
  /** True when this slice differs from the paired line (intra-line highlight). */
  highlight: boolean;
}

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  /** Word-level breakdown for changed lines paired across a remove/add run. */
  segments?: DiffSegment[];
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

/**
 * Strip trailing whitespace from every line. The WYSIWYG → markdown
 * serializer can emit inconsistent trailing spaces, which made a single
 * real edit light up every following line as "changed". Comparing on
 * trimmed lines collapses those spurious whitespace-only diffs so the
 * preview shows just the lines the user actually touched.
 */
function stripTrailingWhitespace(text: string): string {
  return text.replace(/[ \t]+(\r?\n)/g, '$1').replace(/[ \t]+$/, '');
}

/**
 * Build intra-line word segments for a paired removed/added line. `which`
 * picks which side's slices to keep: a removed line keeps removed+common
 * words, an added line keeps added+common words. The differing slices are
 * flagged so the UI can highlight exactly what changed within the line.
 */
function buildSegments(oldLine: string, newLine: string, which: 'removed' | 'added'): DiffSegment[] {
  const parts = diffWordsWithSpace(oldLine, newLine);
  const segments: DiffSegment[] = [];
  for (const part of parts) {
    if (which === 'removed') {
      if (part.added) continue;
      segments.push({ value: part.value, highlight: !!part.removed });
    } else {
      if (part.removed) continue;
      segments.push({ value: part.value, highlight: !!part.added });
    }
  }
  return segments;
}

export function generateDiff(oldText: string, newText: string): { lines: DiffLine[]; stats: DiffStats } {
  const normalizedOld = stripTrailingWhitespace(oldText.replace(/\r\n/g, '\n'));
  const normalizedNew = stripTrailingWhitespace(newText.replace(/\r\n/g, '\n'));

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

  attachWordSegments(lines);

  return { lines, stats: { additions: addCount, deletions: removeCount } };
}

/**
 * Walk the flat diff and, for each maximal run of removed lines immediately
 * followed by added lines, pair them up index-wise and compute word-level
 * segments. Pairing the i-th removed with the i-th added is a good heuristic
 * for the common "edited this line" case and keeps the highlight focused.
 */
function attachWordSegments(lines: DiffLine[]): void {
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== 'removed') { i++; continue; }
    let r = i;
    while (r < lines.length && lines[r].type === 'removed') r++;
    let a = r;
    while (a < lines.length && lines[a].type === 'added') a++;
    const removed = lines.slice(i, r);
    const added = lines.slice(r, a);
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      removed[k].segments = buildSegments(removed[k].content, added[k].content, 'removed');
      added[k].segments = buildSegments(removed[k].content, added[k].content, 'added');
    }
    i = a > i ? a : i + 1;
  }
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
