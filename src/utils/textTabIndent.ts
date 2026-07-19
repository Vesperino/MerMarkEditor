export type TabIndentDirection = 'indent' | 'outdent';

export interface TabIndentInput {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  direction: TabIndentDirection;
}

export interface TabIndentResult {
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

interface Removal {
  start: number;
  length: number;
}

function lineStartAt(text: string, position: number): number {
  return text.lastIndexOf('\n', position - 1) + 1;
}

function touchedLineStarts(text: string, selectionStart: number, selectionEnd: number): number[] {
  const first = lineStartAt(text, selectionStart);
  const lastPosition = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  const last = lineStartAt(text, lastPosition);
  const starts = [first];

  let current = first;
  while (current < last) {
    const newline = text.indexOf('\n', current);
    if (newline === -1) break;
    current = newline + 1;
    starts.push(current);
  }

  return starts;
}

function leadingIndentLength(text: string, lineStart: number): number {
  if (text[lineStart] === '\t') return 1;

  let spaces = 0;
  while (spaces < 4 && text[lineStart + spaces] === ' ') spaces += 1;
  return spaces;
}

function positionAfterRemovals(position: number, removals: Removal[]): number {
  let removed = 0;
  for (const removal of removals) {
    if (position <= removal.start) break;
    removed += Math.min(removal.length, position - removal.start);
  }
  return position - removed;
}

export function applyTabIndent(input: TabIndentInput): TabIndentResult | null {
  const { text, selectionStart, selectionEnd, direction } = input;

  if (direction === 'indent' && lineStartAt(text, selectionStart) === lineStartAt(text, selectionEnd)) {
    return {
      text: `${text.slice(0, selectionStart)}\t${text.slice(selectionEnd)}`,
      selectionStart: selectionStart + 1,
      selectionEnd: selectionStart + 1,
    };
  }

  const lineStarts = touchedLineStarts(text, selectionStart, selectionEnd);

  if (direction === 'indent') {
    let nextText = text;
    for (let i = lineStarts.length - 1; i >= 0; i--) {
      const start = lineStarts[i];
      nextText = `${nextText.slice(0, start)}\t${nextText.slice(start)}`;
    }

    return {
      text: nextText,
      selectionStart: selectionStart + lineStarts.filter((start) => start <= selectionStart).length,
      selectionEnd: selectionEnd + lineStarts.filter((start) => start <= selectionEnd).length,
    };
  }

  const removals = lineStarts
    .map((start) => ({ start, length: leadingIndentLength(text, start) }))
    .filter((removal) => removal.length > 0);
  if (removals.length === 0) return null;

  let nextText = text;
  for (let i = removals.length - 1; i >= 0; i--) {
    const { start, length } = removals[i];
    nextText = `${nextText.slice(0, start)}${nextText.slice(start + length)}`;
  }

  return {
    text: nextText,
    selectionStart: positionAfterRemovals(selectionStart, removals),
    selectionEnd: positionAfterRemovals(selectionEnd, removals),
  };
}
