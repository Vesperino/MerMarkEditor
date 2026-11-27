import { diffArrays } from 'diff';

export interface SourceBlock {
  startLine: number;
  endLine: number; // exclusive
  type: 'code' | 'mermaid' | 'html' | 'table' | 'heading' | 'list' | 'taskList' | 'blockquote' | 'hr' | 'paragraph';
}

/** One top-level editor node expected from a Markdown block; `from`/`to` are
 * character offsets inside the block's source. */
export interface SourceEntry {
  block: number;
  kind: string;
  from: number;
  to: number;
}

const IMAGE = /!\[[^\]]*\]\([^)]*\)/g;

/** The editor keeps images as blocks, so a paragraph with inline images
 * becomes several top-level nodes. Predict that split to keep both sides
 * aligned. */
export function sourceEntries(blocks: SourceBlock[], lines: string[]): SourceEntry[] {
  const entries: SourceEntry[] = [];
  blocks.forEach((block, index) => {
    const raw = lines.slice(block.startLine, block.endLine).join('\n');
    if (block.type === 'heading') {
      const level = lines[block.startLine].trim().match(/^#+/)?.[0].length ?? 1;
      entries.push({ block: index, kind: `heading${level}`, from: 0, to: raw.length });
      return;
    }
    if (block.type !== 'paragraph' || !raw.includes('![')) {
      entries.push({ block: index, kind: block.type, from: 0, to: raw.length });
      return;
    }
    let cursor = 0;
    const text = (from: number, to: number) => {
      if (raw.slice(from, to).trim()) entries.push({ block: index, kind: 'paragraph', from, to });
    };
    for (const match of raw.matchAll(IMAGE)) {
      text(cursor, match.index);
      entries.push({ block: index, kind: 'image', from: match.index, to: match.index + match[0].length });
      cursor = match.index + match[0].length;
    }
    text(cursor, raw.length);
  });
  return entries;
}

const VISUAL_KINDS: Record<string, string> = {
  codeBlock: 'code',
  safeHtmlBlock: 'html',
  bulletList: 'list',
  orderedList: 'list',
  horizontalRule: 'hr',
};

export function visualKind(typeName: string, level?: number): string {
  if (typeName === 'heading') return `heading${level ?? 1}`;
  return VISUAL_KINDS[typeName] ?? typeName;
}

/** Pair two block sequences by kind. Blocks without a counterpart take the
 * nearest paired neighbour, so every index resolves when both sides are
 * non-empty. */
export function alignKinds(source: string[], visual: string[]): { toVisual: number[]; toSource: number[] } {
  const toVisual = new Array<number>(source.length).fill(-1);
  const toSource = new Array<number>(visual.length).fill(-1);
  let s = 0;
  let v = 0;
  let removed = 0;
  let added = 0;
  const pairUnmatched = () => {
    if (removed && added) {
      for (let i = 0; i < removed; i++) toVisual[s - removed + i] = v - added + Math.floor(i * added / removed);
      for (let i = 0; i < added; i++) toSource[v - added + i] = s - removed + Math.floor(i * removed / added);
    }
    removed = 0;
    added = 0;
  };
  for (const part of diffArrays(source, visual)) {
    const count = part.value.length;
    if (part.removed) { s += count; removed += count; continue; }
    if (part.added) { v += count; added += count; continue; }
    pairUnmatched();
    for (let i = 0; i < count; i++) {
      toVisual[s + i] = v + i;
      toSource[v + i] = s + i;
    }
    s += count;
    v += count;
  }
  pairUnmatched();
  const fill = (map: number[]) => {
    for (let i = 1; i < map.length; i++) if (map[i] < 0) map[i] = map[i - 1];
    for (let i = map.length - 2; i >= 0; i--) if (map[i] < 0) map[i] = map[i + 1];
  };
  fill(toVisual);
  fill(toSource);
  return { toVisual, toSource };
}

const LIST_MARKER = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

/** Length of the list marker (indent, bullet, checkbox) opening a line, or -1. */
export function listMarkerLength(line: string): number {
  return line.match(LIST_MARKER)?.[1].length ?? -1;
}

/** Lines that open a list item, in document order: the same order in which
 * the editor nests its list items. */
export function listItemLines(lines: string[], block: SourceBlock): number[] {
  const result: number[] = [];
  for (let line = block.startLine; line < block.endLine; line++) {
    if (listMarkerLength(lines[line]) >= 0) result.push(line);
  }
  return result;
}

/** Character ranges of the trimmed cell contents in one table row. */
export function tableCells(line: string): Array<{ from: number; to: number }> {
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === '|') pipes.push(i);
  }
  const bounds = [...pipes];
  if (line.slice(0, bounds[0] ?? line.length).trim()) bounds.unshift(-1);
  if (line.slice((bounds[bounds.length - 1] ?? -1) + 1).trim()) bounds.push(line.length);
  const cells: Array<{ from: number; to: number }> = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    let from = bounds[i] + 1;
    let to = bounds[i + 1];
    while (from < to && /\s/.test(line[from])) from++;
    while (to > from && /\s/.test(line[to - 1])) to--;
    cells.push({ from, to });
  }
  return cells;
}
