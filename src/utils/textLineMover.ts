export type LineMoveDirection = 'up' | 'down';

export interface LineMoveInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  direction: LineMoveDirection;
}

export interface LineMoveResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface LineBounds {
  index: number;
  start: number;
  end: number;
}

function lineStartOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) offsets.push(i + 1);
  }
  return offsets;
}

function lineBoundsAt(offsets: number[], position: number): LineBounds {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  const start = offsets[lo];
  const end = lo + 1 < offsets.length ? offsets[lo + 1] - 1 : Infinity;
  return { index: lo, start, end };
}

export function moveSelectedLines(input: LineMoveInput): LineMoveResult | null {
  const { text, selectionStart, selectionEnd, direction } = input;
  if (text.length === 0) return null;

  const offsets = lineStartOffsets(text);
  const lines = text.split('\n');
  const totalLines = lines.length;

  const firstLine = lineBoundsAt(offsets, selectionStart).index;
  let lastLine = lineBoundsAt(offsets, selectionEnd).index;
  // Selection ending at column 0 of a later line excludes that line (standard editor UX).
  if (selectionEnd > selectionStart && lastLine > firstLine && offsets[lastLine] === selectionEnd) {
    lastLine -= 1;
  }

  if (direction === 'up' && firstLine === 0) return null;
  if (direction === 'down' && lastLine >= totalLines - 1) return null;

  const next = [...lines];
  let shift: number;
  if (direction === 'up') {
    const above = next[firstLine - 1];
    const moved = next.slice(firstLine, lastLine + 1);
    next.splice(firstLine - 1, lastLine - firstLine + 2, ...moved, above);
    shift = -(above.length + 1);
  } else {
    const below = next[lastLine + 1];
    const moved = next.slice(firstLine, lastLine + 1);
    next.splice(firstLine, lastLine - firstLine + 2, below, ...moved);
    shift = below.length + 1;
  }

  return {
    text: next.join('\n'),
    selectionStart: selectionStart + shift,
    selectionEnd: selectionEnd + shift,
  };
}
