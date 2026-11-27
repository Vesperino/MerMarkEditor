import { ref, nextTick, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import type { Editor as CoreEditor, TiptapEditorHTMLElement } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { CodeEditorHandle } from '../types/code-editor';
import { markdownToHtml } from '../utils/markdown-converter';
import { sourcePreservingMarkdown } from '../utils/source-preserving-markdown';
import { normalizeMarkdown } from '../utils/markdown-save';
import { mapMarkdownCursor } from '../utils/markdown-cursor';
import { getCurrentMermaidReadFormats, type MermaidFormat } from '../utils/mermaid-formats';
import { targetScrollTop } from '../utils/scroll';
import { isStandaloneSafeHtmlBlock, safeHtmlTagTokens } from '../utils/safe-html';
import {
  alignKinds,
  listItemLines,
  listMarkerLength,
  sourceEntries,
  tableCells,
  visualKind,
  type SourceBlock,
  type SourceEntry,
} from '../utils/view-cursor-map';
import {
  DOM_SELECTORS,
  TIMING,
  MAX_DOM_RESTORE_ATTEMPTS,
  SCROLL_OFFSET,
  HIGHLIGHT_PADDING,
} from '../constants';

export interface UseCodeViewOptions {
  getActiveContent: () => string;
  setActiveContent: (content: string, source?: string) => void;
  getSourceMarkdown?: () => string | null | undefined;
  markAsChanged: () => void;
  /** True when this Markdown is exactly what the clean tab last saved. */
  isSavedMarkdown?: (markdown: string) => boolean;
  /** When true at CODE→VISUAL time, convert even if the snapshot is unchanged —
   *  used for markdown-first tabs whose HTML was never generated (issue #129). */
  forceConvertOnExit?: () => boolean;
}

export interface UseCodeViewReturn {
  codeView: Ref<boolean>;
  codeContent: Ref<string>;
  codeEditorRef: Ref<CodeEditorHandle | null>;
  toggleCodeView: (editor: Editor | null | undefined) => Promise<void>;
  onCodeContentUpdate: (value: string) => void;
  enterCodeViewWithMarkdown: (markdown: string) => Promise<void>;
  seedCodeContent: (markdown: string) => void;
}

let activeHighlightElement: HTMLElement | null = null;
let highlightTimer: number | null = null;

// Get line number from character position
const getLineFromPosition = (text: string, pos: number): number => {
  if (pos <= 0) return 0;
  return text.slice(0, pos).split('\n').length - 1;
};

// Build a lookup from `open delimiter line` → matching format. Built per call
// so a fresh format list (e.g. after the user toggles a format in Settings)
// is reflected immediately.
const buildOpenIndex = (formats: MermaidFormat[]): Map<string, MermaidFormat> => {
  const m = new Map<string, MermaidFormat>();
  for (const f of formats) m.set(f.open, f);
  return m;
};

// Inject CSS for cursor highlight animation
const injectHighlightStyles = () => {
  const styleId = 'cursor-highlight-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes cursor-pulse {
      0% {
        background-color: rgba(56, 189, 248, 0.55);
        box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.0);
      }
      50% {
        background-color: rgba(56, 189, 248, 0.35);
        box-shadow: 0 0 18px 6px rgba(56, 189, 248, 0.75),
          0 0 36px 12px rgba(14, 165, 233, 0.45);
      }
      100% {
        background-color: transparent;
        box-shadow: 0 0 0 0 transparent;
      }
    }
    .cursor-highlight {
      animation: cursor-pulse 1s ease-out forwards;
      border-radius: 3px;
      pointer-events: none;
      position: absolute;
      z-index: 9999;
    }
    .cursor-highlight-line {
      animation: cursor-pulse 1s ease-out forwards !important;
      position: relative;
      border-radius: 3px;
    }
    .ProseMirror .cursor-highlight-line {
      background-color: rgba(56, 189, 248, 0.55) !important;
      box-shadow: 0 0 18px 6px rgba(56, 189, 248, 0.75),
        0 0 36px 12px rgba(14, 165, 233, 0.45) !important;
      animation: cursor-pulse 1s ease-out forwards !important;
    }
  `;
  document.head.appendChild(style);
};

const clearVisualHighlight = () => {
  if (activeHighlightElement) {
    if (activeHighlightElement.classList.contains('cursor-highlight')) {
      activeHighlightElement.remove();
    } else {
      activeHighlightElement.classList.remove('cursor-highlight-line');
    }
    activeHighlightElement = null;
  }
  if (highlightTimer !== null) {
    window.clearTimeout(highlightTimer);
    highlightTimer = null;
  }
};

const getHighlightRect = (element: HTMLElement): HighlightRect => {
  const content = element.closest(DOM_SELECTORS.EDITOR_CONTENT) as HTMLElement | null;
  const contentRect = content ? content.getBoundingClientRect() : element.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  return {
    left: contentRect.left,
    top: targetRect.top - HIGHLIGHT_PADDING,
    width: contentRect.width,
    height: Math.max(24, targetRect.height) + (HIGHLIGHT_PADDING * 2),
  };
};

interface HighlightRect { left: number; top: number; width: number; height: number }

// The overlay follows its target every frame because the page can still
// reflow and scroll while it is shown.
const showVisualHighlight = (rectOf: () => HighlightRect) => {
  clearVisualHighlight();
  const first = rectOf();
  if (first.width <= 0 || first.height <= 0) return;

  const highlight = document.createElement('div');
  highlight.className = 'cursor-highlight';
  highlight.style.position = 'fixed';
  const place = () => {
    if (activeHighlightElement !== highlight) return;
    const rect = rectOf();
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    requestAnimationFrame(place);
  };

  document.body.appendChild(highlight);
  activeHighlightElement = highlight;
  place();

  highlightTimer = window.setTimeout(() => {
    highlight.remove();
    if (activeHighlightElement === highlight) {
      activeHighlightElement = null;
    }
    highlightTimer = null;
  }, TIMING.HIGHLIGHT_DURATION);
};

const getActiveEditorContainer = (): HTMLElement | null => {
  return document.querySelector(DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER) as HTMLElement | null;
};

const getFallbackEditorContainer = (): HTMLElement | null => {
  const containers = document.querySelectorAll(DOM_SELECTORS.EDITOR_CONTAINER);
  if (containers.length === 1) {
    return containers[0] as HTMLElement;
  }
  return null;
};

const scrollContainerToElement = (container: HTMLElement, target: HTMLElement, offset: number) => {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  container.scrollTop = targetScrollTop(containerRect.top, targetRect.top, container.scrollTop, offset);
};

const SCROLL_HOLD_QUIET_MS = 250;
const SCROLL_HOLD_MAX_MS = 2500;
const SCROLL_HOLD_CANCEL_EVENTS = ['wheel', 'pointerdown', 'keydown', 'touchstart'];
let cancelScrollHold: (() => void) | null = null;

// The remounted editor keeps growing while diagrams and images above the
// target render, which drags a one-off scroll away from it. Re-apply the
// scroll until the layout holds still or the user takes over.
const holdScroll = (container: HTMLElement, apply: () => void) => {
  cancelScrollHold?.();
  const started = performance.now();
  let quietSince = started;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    SCROLL_HOLD_CANCEL_EVENTS.forEach(type => container.removeEventListener(type, stop));
    if (cancelScrollHold === stop) cancelScrollHold = null;
  };
  const step = () => {
    if (!container.isConnected) { stop(); return; }
    const before = container.scrollTop;
    apply();
    const now = performance.now();
    if (Math.abs(container.scrollTop - before) > 1) quietSince = now;
    if (now - quietSince > SCROLL_HOLD_QUIET_MS || now - started > SCROLL_HOLD_MAX_MS) { stop(); return; }
    frame = requestAnimationFrame(step);
  };
  SCROLL_HOLD_CANCEL_EVENTS.forEach(type => container.addEventListener(type, stop, { passive: true }));
  cancelScrollHold = stop;
  step();
};

const getProseMirrorRoot = (container: HTMLElement): HTMLElement | null => {
  return container.querySelector(DOM_SELECTORS.PROSE_MIRROR) as HTMLElement | null;
};

// ── Source-line block map: precise markdown → DOM mapping ──────────────────

type MarkdownBlock = SourceBlock;

// Parse markdown into blocks with exact source-line ranges.
// Each block corresponds to one top-level ProseMirror child element.
const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const openIndex = buildOpenIndex(getCurrentMermaidReadFormats());
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Supported README HTML is represented by one atomic visual node, so its
    // complete source range must also be one block for cursor restoration.
    const htmlBlockStart = trimmed.match(/^<(p|details)\b/i);
    if (htmlBlockStart) {
      const startLine = i;
      const tag = htmlBlockStart[1];
      let depth = 0;
      do {
        for (const token of safeHtmlTagTokens(lines[i])) {
          if (token.name !== tag.toLowerCase()) continue;
          if (token.closing) depth = Math.max(0, depth - 1);
          else if (!token.selfClosing) depth++;
        }
        i++;
      } while (i < lines.length && depth > 0);
      blocks.push({ startLine, endLine: i, type: 'html' });
      continue;
    }
    if (/^<(?:img|a)\b/i.test(trimmed) && isStandaloneSafeHtmlBlock(trimmed)) {
      blocks.push({ startLine: i, endLine: i + 1, type: 'html' });
      i++;
      continue;
    }

    // Mermaid blocks: any enabled format's open delimiter. The matching close
    // is taken from the format that opened the block so a `:::mermaid` block
    // doesn't accidentally close on a `\`\`\`` two lines down.
    const fmt = openIndex.get(trimmed);
    if (fmt) {
      const startLine = i;
      i++;
      while (i < lines.length && lines[i].trim() !== fmt.close) i++;
      if (i < lines.length) i++;
      blocks.push({ startLine, endLine: i, type: 'mermaid' });
      continue;
    }

    // Fenced code: the closing fence repeats the opening character at least as
    // many times, so a longer fence can hold a shorter one.
    const fence = trimmed.match(/^(`{3,}|~{3,})/);
    if (fence) {
      const closing = new RegExp(`^${fence[1][0]}{${fence[1].length},}\\s*$`);
      const startLine = i;
      i++;
      while (i < lines.length && !closing.test(lines[i].trim())) i++;
      if (i < lines.length) i++;
      blocks.push({ startLine, endLine: i, type: 'code' });
      continue;
    }

    // Tables: contiguous lines starting with |
    if (trimmed.startsWith('|')) {
      const startLine = i;
      while (i < lines.length && lines[i].trim().startsWith('|')) i++;
      blocks.push({ startLine, endLine: i, type: 'table' });
      continue;
    }

    // Headings
    if (/^#{1,6}\s/.test(trimmed)) {
      blocks.push({ startLine: i, endLine: i + 1, type: 'heading' });
      i++;
      continue;
    }

    // Horizontal rules (only --- is converted to <hr> by the converter)
    if (trimmed === '---') {
      blocks.push({ startLine: i, endLine: i + 1, type: 'hr' });
      i++;
      continue;
    }

    // Task lists: - [ ] or - [x]
    if (/^- \[[ x]\]\s/i.test(trimmed)) {
      const startLine = i;
      while (i < lines.length && /^- \[[ x]\]\s/i.test(lines[i].trim())) i++;
      blocks.push({ startLine, endLine: i, type: 'taskList' });
      continue;
    }

    // Blockquotes: > text
    if (trimmed.startsWith('>')) {
      const startLine = i;
      while (i < lines.length && lines[i].trim().startsWith('>')) i++;
      blocks.push({ startLine, endLine: i, type: 'blockquote' });
      continue;
    }

    // Lists: - item, * item, + item, N. item
    if (/^(\s*[-*+]|\s*\d+\.)\s/.test(line)) {
      const startLine = i;
      while (i < lines.length) {
        const curLine = lines[i];
        const curTrimmed = curLine.trim();
        if (!curTrimmed) {
          // Blank line — check if list continues (but not with a task item)
          let nextIdx = i + 1;
          while (nextIdx < lines.length && !lines[nextIdx].trim()) nextIdx++;
          if (nextIdx < lines.length
            && (/^\s*[-*+]\s/.test(lines[nextIdx]) || /^\s*\d+\.\s/.test(lines[nextIdx]) || /^\s{2,}/.test(lines[nextIdx]))
            && !/^- \[[ x]\]\s/i.test(lines[nextIdx].trim())) {
            i++;
            continue;
          }
          break;
        }
        // Stop at task list items interspersed in regular lists
        if (/^- \[[ x]\]\s/i.test(curTrimmed)) break;
        if (/^\s*[-*+]\s/.test(curLine) || /^\s*\d+\.\s/.test(curLine) || /^\s{2,}/.test(curLine)) {
          i++;
        } else {
          break;
        }
      }
      blocks.push({ startLine, endLine: i, type: 'list' });
      continue;
    }

    // Indented code blocks (4 spaces / tab, after a blank line) render as a
    // single <pre> (issue #118). Lines reaching this point are never list
    // continuations — the list branch above consumes those.
    if (/^(?: {4}|\t)/.test(line) && (i === 0 || lines[i - 1].trim() === '')) {
      const startLine = i;
      let j = i;
      let lastContent = i;
      while (j < lines.length) {
        if (!lines[j].trim()) { j++; continue; }
        if (/^(?: {4}|\t)/.test(lines[j])) { lastContent = j; j++; continue; }
        break;
      }
      i = lastContent + 1;
      blocks.push({ startLine, endLine: i, type: 'code' });
      continue;
    }

    // Soft/hard line breaks stay in one paragraph; blank lines create paragraph breaks.
    // Keep the complete paragraph source range for cursor restoration.
    const previous = blocks[blocks.length - 1];
    if (previous?.type === 'paragraph' && previous.endLine === i) {
      previous.endLine = i + 1;
    } else {
      blocks.push({ startLine: i, endLine: i + 1, type: 'paragraph' });
    }
    i++;
  }

  return blocks;
};

// ── Block alignment: Markdown source ↔ editor document ─────────────────────

interface ViewAlignment {
  lines: string[];
  lineStarts: number[];
  blocks: MarkdownBlock[];
  entries: SourceEntry[];
  /** Document offset of every top-level editor node. */
  starts: number[];
  toVisual: number[];
  toSource: number[];
}

interface VisualTarget {
  pos: number;
  element: HTMLElement | null;
  lineInCode?: number;
}

const isFenced = (line: string): boolean => /^\s*(?:`{3,}|~{3,})/.test(line);
const codeIndent = (line: string): number => line.match(/^(?: {4}|\t)?/)![0].length;
const isListItem = (node: ProseMirrorNode): boolean => node.type.name === 'listItem' || node.type.name === 'taskItem';
const visibleText = (node: ProseMirrorNode): string => node.textBetween(0, node.content.size, '', '\n');

// Block counts differ between the two views (inline images become their own
// editor blocks, some syntax has no parsed counterpart), so blocks are paired
// by kind instead of by index.
const buildAlignment = (editor: CoreEditor, markdown: string): ViewAlignment => {
  const lines = markdown.split('\n');
  const lineStarts: number[] = [];
  let position = 0;
  for (const line of lines) {
    lineStarts.push(position);
    position += line.length + 1;
  }
  const blocks = parseMarkdownBlocks(markdown);
  const entries = sourceEntries(blocks, lines);
  const kinds: string[] = [];
  const starts: number[] = [];
  editor.state.doc.forEach((node, offset) => {
    kinds.push(visualKind(node.type.name, node.attrs.level));
    starts.push(offset);
  });
  return { lines, lineStarts, blocks, entries, starts, ...alignKinds(entries.map(entry => entry.kind), kinds) };
};

const visualToSource = (
  editor: CoreEditor,
  a: ViewAlignment,
  pos: number,
  bias: 'before' | 'after' = 'before',
): number => {
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  const top = Math.min($pos.index(0), doc.childCount - 1);
  const entry = a.entries[a.toSource[top]];
  if (!entry) return -1;

  const block = a.blocks[entry.block];
  const node = doc.child(top);
  const last = block.endLine - 1;
  const blockStart = a.lineStarts[block.startLine] + entry.from;
  const parent = $pos.parent;
  const mapped = (raw: string) => mapMarkdownCursor(visibleText(parent), raw, $pos.parentOffset, bias) ?? 0;

  if (entry.kind === 'paragraph' || block.type === 'heading') {
    if (parent !== node || !node.isTextblock) return blockStart;
    const raw = a.lines.slice(block.startLine, block.endLine).join('\n').slice(entry.from, entry.to);
    return blockStart + mapped(raw);
  }

  if (block.type === 'list' || block.type === 'taskList') {
    let ordinal = -1;
    node.descendants((child, offset) => {
      if (isListItem(child) && a.starts[top] + 1 + offset < pos) ordinal++;
    });
    const itemLines = listItemLines(a.lines, block);
    const line = itemLines[Math.min(Math.max(ordinal, 0), itemLines.length - 1)] ?? block.startLine;
    const marker = listMarkerLength(a.lines[line]);
    const firstInItem = parent.isTextblock && $pos.depth >= 2
      && $pos.index($pos.depth - 1) === 0 && isListItem($pos.node($pos.depth - 1));
    if (marker < 0 || !firstInItem) return a.lineStarts[line];
    return a.lineStarts[line] + marker + mapped(a.lines[line].slice(marker));
  }

  if (block.type === 'table' && node.type.name === 'table' && $pos.depth >= 3) {
    const row = $pos.index(1);
    // Row 0 is the header; the separator line follows it.
    const line = Math.min(last, block.startLine + (row === 0 ? 0 : row + 1));
    const cell = tableCells(a.lines[line])[$pos.index(2)];
    if (!cell || !parent.isTextblock) return a.lineStarts[line];
    return a.lineStarts[line] + cell.from + mapped(a.lines[line].slice(cell.from, cell.to));
  }

  if (block.type === 'code' && parent.type.name === 'codeBlock') {
    const before = parent.textBetween(0, $pos.parentOffset);
    const fenced = isFenced(a.lines[block.startLine]);
    const line = Math.min(last, block.startLine + (fenced ? 1 : 0) + before.split('\n').length - 1);
    const column = (fenced ? 0 : codeIndent(a.lines[line])) + before.length - before.lastIndexOf('\n') - 1;
    return a.lineStarts[line] + Math.min(column, a.lines[line].length);
  }

  if (block.type === 'html') {
    const dom = editor.view.nodeDOM(a.starts[top]);
    const offset = dom instanceof HTMLElement ? Number(dom.dataset.safeHtmlCursorLine ?? 0) || 0 : 0;
    return a.lineStarts[Math.min(last, block.startLine + Math.max(0, offset))];
  }

  return blockStart;
};

const sourceToVisual = (editor: CoreEditor, a: ViewAlignment, offset: number): VisualTarget | null => {
  const { doc } = editor.state;
  let line = 0;
  while (line + 1 < a.lineStarts.length && a.lineStarts[line + 1] <= offset) line++;

  let blockIndex = a.blocks.findIndex(block => line >= block.startLine && line < block.endLine);
  let column = offset - a.lineStarts[line];
  if (blockIndex < 0) {
    // A blank line between blocks snaps to the nearest one.
    let distance = Infinity;
    a.blocks.forEach((block, index) => {
      const before = line < block.startLine;
      const gap = before ? block.startLine - line : line - (block.endLine - 1);
      if (gap < distance) { distance = gap; blockIndex = index; }
    });
    if (blockIndex < 0) return null;
    const block = a.blocks[blockIndex];
    line = line < block.startLine ? block.startLine : block.endLine - 1;
    column = line === block.startLine ? 0 : a.lines[line].length;
  }

  const block = a.blocks[blockIndex];
  const inBlock = a.lineStarts[line] + column - a.lineStarts[block.startLine];
  let entryIndex = -1;
  a.entries.forEach((entry, index) => {
    if (entry.block === blockIndex && (entryIndex < 0 || entry.from <= inBlock)) entryIndex = index;
  });
  const top = a.toVisual[entryIndex];
  if (top === undefined || top < 0) return null;

  const entry = a.entries[entryIndex];
  const node = doc.child(top);
  const start = a.starts[top];
  const domAt = (pos: number): HTMLElement | null => {
    const dom = editor.view.nodeDOM(pos);
    return dom instanceof HTMLElement ? dom : null;
  };
  const mapped = (raw: string, textblock: ProseMirrorNode, at: number) => Math.min(
    mapMarkdownCursor(raw, visibleText(textblock), Math.max(0, Math.min(at, raw.length))) ?? 0,
    textblock.content.size,
  );

  if ((entry.kind === 'paragraph' || block.type === 'heading') && node.isTextblock) {
    const raw = a.lines.slice(block.startLine, block.endLine).join('\n').slice(entry.from, entry.to);
    return { pos: start + 1 + mapped(raw, node, inBlock - entry.from), element: domAt(start) };
  }

  if (block.type === 'list' || block.type === 'taskList') {
    const ordinal = Math.max(0, listItemLines(a.lines, block).filter(itemLine => itemLine <= line).length - 1);
    const items: Array<{ node: ProseMirrorNode; pos: number }> = [];
    node.descendants((child, childOffset) => {
      if (isListItem(child)) items.push({ node: child, pos: start + 1 + childOffset });
    });
    const item = items[Math.min(ordinal, items.length - 1)];
    if (item) {
      const first = item.node.firstChild;
      const marker = listMarkerLength(a.lines[line]);
      const pos = first?.isTextblock
        ? item.pos + 2 + (marker >= 0 ? mapped(a.lines[line].slice(marker), first, column - marker) : 0)
        : item.pos + 1;
      return { pos, element: domAt(item.pos) };
    }
  }

  if (block.type === 'table' && node.type.name === 'table' && node.childCount > 0) {
    const lineInBlock = line - block.startLine;
    const rowIndex = Math.min(lineInBlock <= 1 ? 0 : lineInBlock - 1, node.childCount - 1);
    const cells = tableCells(a.lines[line]);
    const sourceCell = Math.max(0, cells.filter(cell => cell.from <= column).length - 1);
    let rowPos = start + 1;
    for (let i = 0; i < rowIndex; i++) rowPos += node.child(i).nodeSize;
    const row = node.child(rowIndex);
    const cellIndex = Math.min(sourceCell, row.childCount - 1);
    let cellPos = rowPos + 1;
    for (let i = 0; i < cellIndex; i++) cellPos += row.child(i).nodeSize;
    const first = row.child(cellIndex).firstChild;
    const cell = cells[sourceCell];
    // Line 1 is the separator row, which has no visual counterpart.
    const pos = first?.isTextblock
      ? cellPos + 2 + (cell && lineInBlock !== 1 ? mapped(a.lines[line].slice(cell.from, cell.to), first, column - cell.from) : 0)
      : cellPos + 1;
    return { pos, element: domAt(cellPos) ?? domAt(start) };
  }

  if (block.type === 'code' && node.type.name === 'codeBlock') {
    const fenced = isFenced(a.lines[block.startLine]);
    const codeLines = node.textContent.split('\n');
    const sourceLine = line - block.startLine - (fenced ? 1 : 0);
    const lineInCode = Math.max(0, Math.min(sourceLine, codeLines.length - 1));
    let pos = start + 1;
    for (let i = 0; i < lineInCode; i++) pos += codeLines[i].length + 1;
    if (sourceLine === lineInCode) {
      const indent = fenced ? 0 : codeIndent(a.lines[line]);
      pos += Math.max(0, Math.min(column - indent, codeLines[lineInCode].length));
    }
    return { pos, element: domAt(start), lineInCode };
  }

  const element = domAt(start);
  if (block.type === 'html' && element) {
    const lineInBlock = line - block.startLine;
    element.dataset.safeHtmlCursorLine = String(lineInBlock);
    return {
      pos: start,
      element: element.querySelector<HTMLElement>(`[data-safe-html-source-line="${lineInBlock}"]`) ?? element,
    };
  }
  return { pos: start, element };
};

export function useCodeView(options: UseCodeViewOptions): UseCodeViewReturn {
  const codeView = ref(false);
  const codeContent = ref('');
  const codeEditorRef = ref<CodeEditorHandle | null>(null);
  const savedCursorLine = ref(0);
  const savedScrollRatio = ref(0);
  // Visual selection placed by the last Code → Visual restore; -1 when none was placed.
  let restoredVisualFrom = -1;
  let codeContentSnapshot = '';
  let isToggling = false;

  // Inject styles on module load
  injectHighlightStyles();

  const { getActiveContent, setActiveContent, markAsChanged, forceConvertOnExit } = options;

  const enterCodeViewWithMarkdown = async (markdown: string): Promise<void> => {
    codeContent.value = normalizeMarkdown(markdown);
    codeContentSnapshot = codeContent.value;
    codeView.value = true;
    await nextTick();
    codeEditorRef.value?.focus();
  };

  const seedCodeContent = (markdown: string): void => {
    codeContent.value = normalizeMarkdown(markdown);
    codeContentSnapshot = codeContent.value;
  };

  const toggleCodeView = async (editor: Editor | null | undefined): Promise<void> => {
    if (isToggling) return;
    isToggling = true;
    if (!codeView.value) {
      // ═══════════════════════════════════════════════════════════════════
      // VISUAL → CODE
      // ═══════════════════════════════════════════════════════════════════

      let markerPosition = -1;
      let markerEnd = -1;

      if (editor) {
        const { from, to } = editor.state.selection;

        codeContent.value = normalizeMarkdown(sourcePreservingMarkdown(editor.getHTML(), options.getSourceMarkdown?.()));

        try {
          const alignment = buildAlignment(editor, codeContent.value);
          const range = to > from && !(editor.state.selection instanceof NodeSelection);
          markerPosition = Math.min(visualToSource(editor, alignment, from, range ? 'after' : 'before'), codeContent.value.length);
          if (markerPosition >= 0 && range) {
            markerEnd = Math.min(visualToSource(editor, alignment, to), codeContent.value.length);
          }
        } catch { /* resolve() can throw for invalid positions */ }

        // A cursor the user moved in Visual wins over the line remembered from Code.
        const cursorUntouched = restoredVisualFrom < 0 || from === restoredVisualFrom;
        if (savedCursorLine.value > 5 && cursorUntouched) {
          const resolvedLine = markerPosition >= 0
            ? getLineFromPosition(codeContent.value, markerPosition)
            : -1;
          if (resolvedLine <= 2) {
            const lines = codeContent.value.split('\n');
            let pos = 0;
            for (let i = 0; i < savedCursorLine.value && i < lines.length; i++) {
              pos += lines[i].length + 1;
            }
            markerPosition = Math.min(pos, codeContent.value.length);
            markerEnd = -1;
          }
        }
      } else {
        const html = getActiveContent();
        codeContent.value = normalizeMarkdown(sourcePreservingMarkdown(html, options.getSourceMarkdown?.()));
      }

      codeContentSnapshot = codeContent.value;

      // Save scroll ratio as fallback
      const editorContainer = document.querySelector(DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER);
      if (editorContainer) {
        const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
        savedScrollRatio.value = maxScroll > 0 ? editorContainer.scrollTop / maxScroll : 0;
      }

      codeView.value = true;

      await nextTick();
      await nextTick();

      if (codeEditorRef.value) {
        codeEditorRef.value.focus();

        if (markerPosition >= 0) {
          codeEditorRef.value.setSelection(markerPosition, Math.max(markerPosition, markerEnd));
          codeEditorRef.value.scrollToPosition(markerPosition);
        } else {
          codeEditorRef.value.scrollToRatio(savedScrollRatio.value);
        }

        window.setTimeout(() => {
          codeEditorRef.value?.highlightSelectionLine(TIMING.CODE_HIGHLIGHT_DURATION);
          isToggling = false;
        }, TIMING.HIGHLIGHT_DELAY);
      } else {
        isToggling = false;
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // CODE → VISUAL
      // ═══════════════════════════════════════════════════════════════════

      let cursorLine = 0;
      let sourceCursorPosition = 0;
      let sourceSelectionEnd = 0;

      if (codeEditorRef.value) {
        const selection = codeEditorRef.value.getSelection();
        sourceCursorPosition = selection.start;
        sourceSelectionEnd = selection.end;
        cursorLine = getLineFromPosition(codeContent.value, sourceCursorPosition);

        // Save scroll ratio as fallback
        savedScrollRatio.value = codeEditorRef.value.getScrollRatio();
      }

      savedCursorLine.value = cursorLine;
      restoredVisualFrom = -1;

      const editedInCode = codeContent.value !== codeContentSnapshot;
      const contentChanged = editedInCode || (forceConvertOnExit?.() ?? false);

      if (contentChanged) {
        const html = markdownToHtml(codeContent.value);
        setActiveContent(html, codeContent.value);
        if (editedInCode && !options.isSavedMarkdown?.(codeContent.value)) markAsChanged();
      }

      codeView.value = false;

      await nextTick();
      await nextTick();

      // Restore cursor position — retry until DOM is ready (needed after content change)
      const scheduleVisualRestore = () => {
        let attempts = 0;
        const maxAttempts = MAX_DOM_RESTORE_ATTEMPTS;

        const tryRestore = () => {
          const editorContainer = getActiveEditorContainer() ||
            (attempts >= maxAttempts - 1 ? getFallbackEditorContainer() : null);

          if (!editorContainer) {
            if (attempts < maxAttempts) {
              attempts += 1;
              window.setTimeout(tryRestore, TIMING.DOM_RETRY_INTERVAL);
            } else {
              isToggling = false;
            }
            return;
          }

          const proseMirror = getProseMirrorRoot(editorContainer);
          if (!proseMirror || proseMirror.childElementCount === 0) {
            if (attempts < maxAttempts) {
              attempts += 1;
              window.setTimeout(tryRestore, TIMING.DOM_RETRY_INTERVAL);
            } else {
              isToggling = false;
            }
            return;
          }

          // The editor passed in was unmounted with Visual; use the instance owning this DOM.
          const liveEditor = (proseMirror as TiptapEditorHTMLElement).editor ?? editor;
          let target: VisualTarget | null = null;
          let targetEnd = -1;
          if (liveEditor) {
            try {
              const alignment = buildAlignment(liveEditor, codeContent.value);
              target = sourceToVisual(liveEditor, alignment, sourceCursorPosition);
              if (target && sourceSelectionEnd > sourceCursorPosition) {
                targetEnd = sourceToVisual(liveEditor, alignment, sourceSelectionEnd)?.pos ?? -1;
              }
            } catch { /* positions can be invalid while the DOM is not in sync */ }
          }
          const targetElement = target?.element ?? null;

          if (target && targetElement && liveEditor) {
            try {
              if (targetElement.closest('.safe-html-block')) {
                liveEditor.commands.setNodeSelection(target.pos);
              } else {
                liveEditor.commands.setTextSelection(targetEnd > target.pos ? { from: target.pos, to: targetEnd } : target.pos);
                liveEditor.commands.focus(undefined, { scrollIntoView: false });
              }
              restoredVisualFrom = liveEditor.state.selection.from;
            } catch { /* the selection can be rejected if the DOM is not in sync */ }

            const lineInCodeBlock = target.lineInCode ?? 0;
            let lineTop = 0;
            let lineHeight = 0;
            if (lineInCodeBlock > 0) {
              const blockCs = window.getComputedStyle(targetElement.querySelector('code') ?? targetElement);
              lineHeight = blockCs.lineHeight === 'normal'
                ? parseFloat(blockCs.fontSize) * 1.2
                : parseFloat(blockCs.lineHeight);
              lineTop = (parseFloat(window.getComputedStyle(targetElement).paddingTop) || 0) + lineInCodeBlock * lineHeight;
            }
            // A line deep inside a long code block is brought to the offset instead of the block's top.
            const scrollOffset = SCROLL_OFFSET - Math.max(0, lineTop - SCROLL_OFFSET);
            holdScroll(editorContainer, () => scrollContainerToElement(editorContainer, targetElement, scrollOffset));
            requestAnimationFrame(() => {
              showVisualHighlight(lineInCodeBlock > 0
                ? () => {
                  const rect = targetElement.getBoundingClientRect();
                  return { left: rect.left, top: rect.top + lineTop - HIGHLIGHT_PADDING, width: rect.width, height: lineHeight + HIGHLIGHT_PADDING * 2 };
                }
                : () => getHighlightRect(targetElement));
              isToggling = false;
            });
            return;
          }

          // Last resort: scroll ratio
          const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
          if (maxScroll > 0) {
            editorContainer.scrollTop = Math.round(savedScrollRatio.value * maxScroll);
          }
          isToggling = false;
        };

        tryRestore();
      };

      window.setTimeout(scheduleVisualRestore, contentChanged ? 150 : TIMING.VIEW_SWITCH_RESTORE_DELAY);
    }
  };

  const onCodeContentUpdate = (value: string): void => {
    codeContent.value = normalizeMarkdown(value);
    markAsChanged();
  };

  return {
    codeView,
    codeContent,
    codeEditorRef,
    toggleCodeView,
    onCodeContentUpdate,
    enterCodeViewWithMarkdown,
    seedCodeContent,
  };
}
