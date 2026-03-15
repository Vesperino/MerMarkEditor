import { ref, nextTick, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';
import {
  DOM_SELECTORS,
  TIMING,
  MAX_DOM_RESTORE_ATTEMPTS,
  SCROLL_OFFSET,
  HIGHLIGHT_PADDING,
} from '../constants';

export interface UseCodeViewOptions {
  getActiveContent: () => string;
  setActiveContent: (content: string) => void;
  markAsChanged: () => void;
}

export interface UseCodeViewReturn {
  codeView: Ref<boolean>;
  codeContent: Ref<string>;
  codeEditorRef: Ref<HTMLTextAreaElement | null>;
  toggleCodeView: (editor: Editor | null | undefined) => Promise<void>;
  onCodeContentUpdate: (value: string) => void;
}

// Cursor marker - unique string that won't appear in normal content
const CURSOR_MARKER = '\u200B__CURSOR__\u200B'; // Zero-width spaces + marker

let activeHighlightElement: HTMLElement | null = null;
let highlightTimer: number | null = null;

// Find cursor marker position and remove it
const extractMarkerPosition = (text: string): { position: number; clean: string } => {
  const pos = text.indexOf(CURSOR_MARKER);
  if (pos === -1) {
    return { position: -1, clean: text };
  }
  return {
    position: pos,
    clean: text.slice(0, pos) + text.slice(pos + CURSOR_MARKER.length),
  };
};

// Get line number from character position
const getLineFromPosition = (text: string, pos: number): number => {
  if (pos <= 0) return 0;
  return text.slice(0, pos).split('\n').length - 1;
};

// Check if cursor position is inside a code block (``` ... ```)
// Returns { inside: boolean, blockIndex: number } - blockIndex is 0-based index of which code block
const getCodeBlockInfo = (text: string, cursorPos: number): { inside: boolean; blockIndex: number } => {
  const textBefore = text.slice(0, cursorPos);

  // Count code block delimiters before cursor
  const codeBlockPattern = /^```/gm;
  const matches = textBefore.match(codeBlockPattern);

  if (!matches) return { inside: false, blockIndex: -1 };

  // If odd number of ```, we're inside a code block
  const inside = matches.length % 2 === 1;

  // Calculate which code block we're in (0-based)
  // Each pair of ``` is one code block, so blockIndex = floor(count / 2)
  // If inside, we're in block at index floor((count-1) / 2) = floor(count/2) when count is odd
  const blockIndex = inside ? Math.floor((matches.length - 1) / 2) : -1;

  return { inside, blockIndex };
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

const getHighlightRect = (element: HTMLElement) => {
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

const highlightVisualElement = (element: HTMLElement) => {
  clearVisualHighlight();
  const rect = getHighlightRect(element);
  if (rect.width <= 0 || rect.height <= 0) return;

  const highlight = document.createElement('div');
  highlight.className = 'cursor-highlight';
  highlight.style.position = 'fixed';
  highlight.style.left = `${rect.left}px`;
  highlight.style.top = `${rect.top}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  document.body.appendChild(highlight);
  activeHighlightElement = highlight;

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
  const targetTop = targetRect.top - containerRect.top + container.scrollTop - offset;
  container.scrollTop = Math.max(0, targetTop);
};

const getProseMirrorRoot = (container: HTMLElement): HTMLElement | null => {
  return container.querySelector(DOM_SELECTORS.PROSE_MIRROR) as HTMLElement | null;
};

// ── Source-line block map: precise markdown → DOM mapping ──────────────────

interface MarkdownBlock {
  startLine: number;
  endLine: number; // exclusive
  type: 'code' | 'mermaid' | 'table' | 'heading' | 'list' | 'taskList' | 'blockquote' | 'hr' | 'paragraph';
}

// Parse markdown into blocks with exact source-line ranges.
// Each block corresponds to one top-level ProseMirror child element.
const parseMarkdownBlocks = (markdown: string): MarkdownBlock[] => {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    // Code/Mermaid blocks: ``` ... ```
    if (trimmed.startsWith('```')) {
      const startLine = i;
      const isMermaid = /^```mermaid$/i.test(trimmed);
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) i++;
      if (i < lines.length) i++;
      blocks.push({ startLine, endLine: i, type: isMermaid ? 'mermaid' : 'code' });
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

    // Paragraph: each non-block line is its own paragraph in the converter
    blocks.push({ startLine: i, endLine: i + 1, type: 'paragraph' });
    i++;
  }

  return blocks;
};

// Find DOM element using markdown block structure mapped to ProseMirror children.
// Each markdown block corresponds 1:1 to a top-level ProseMirror child in order.
const findElementByBlockMap = (
  root: HTMLElement,
  markdown: string,
  cursorLine: number,
): HTMLElement | null => {
  const blocks = parseMarkdownBlocks(markdown);
  const children = Array.from(root.children) as HTMLElement[];

  if (blocks.length === 0 || children.length === 0) return null;

  // If block count diverges too far from DOM children, mapping is unreliable
  if (Math.abs(blocks.length - children.length) > Math.max(2, Math.ceil(blocks.length * 0.1))) {
    return null;
  }

  // Find the block containing the cursor line
  let blockIndex = -1;
  for (let bi = 0; bi < blocks.length; bi++) {
    if (cursorLine >= blocks[bi].startLine && cursorLine < blocks[bi].endLine) {
      blockIndex = bi;
      break;
    }
  }

  // Cursor on a blank line between blocks — snap to nearest
  if (blockIndex === -1) {
    let minDist = Infinity;
    for (let bi = 0; bi < blocks.length; bi++) {
      const dist = Math.min(
        Math.abs(cursorLine - blocks[bi].startLine),
        Math.abs(cursorLine - (blocks[bi].endLine - 1)),
      );
      if (dist < minDist) { minDist = dist; blockIndex = bi; }
    }
  }

  if (blockIndex < 0) return null;

  const clampedIndex = Math.min(blockIndex, children.length - 1);
  const element = children[clampedIndex];
  const block = blocks[blockIndex];

  // Drill into list items for more precision
  if (block.type === 'list' || block.type === 'taskList') {
    const items = Array.from(element.querySelectorAll(':scope > li')) as HTMLElement[];
    if (items.length > 0) {
      const lineInBlock = cursorLine - block.startLine;
      const itemIndex = Math.min(Math.max(0, lineInBlock), items.length - 1);
      return items[itemIndex];
    }
  }

  return element;
};

// Try to find a DOM element by matching the text content of the cursor's
// markdown line. This is more robust than line counting for large documents
// where cumulative estimation drift causes misses.
const findElementByText = (root: HTMLElement, markdown: string, cursorLine: number): HTMLElement | null => {
  const lines = markdown.split('\n');
  const line = lines[cursorLine];
  if (!line) return null;

  const trimmed = line.trim();
  if (!trimmed) return null;

  // Heading: strip # prefix and search heading elements
  const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    const text = headingMatch[2].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
    const headings = root.querySelectorAll(`h${level}`) as NodeListOf<HTMLElement>;
    for (const h of headings) {
      if (h.textContent?.trim() === text) return h;
    }
    // Partial match fallback
    for (const h of headings) {
      if (text.length >= 5 && h.textContent?.includes(text.slice(0, 30))) return h;
    }
    return null;
  }

  // List item: strip bullet/number prefix
  const listMatch = trimmed.match(/^(?:[-*+]|\d+\.)\s+(.+)$/);
  if (listMatch) {
    const text = listMatch[1].replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1').trim();
    if (text.length < 5) return null;
    const items = root.querySelectorAll('li') as NodeListOf<HTMLElement>;
    for (const li of items) {
      if (li.textContent?.includes(text.slice(0, 40))) return li;
    }
    return null;
  }

  // Blockquote: strip > prefix
  if (trimmed.startsWith('>')) {
    const text = trimmed.replace(/^>\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1').trim();
    if (text.length < 5) return null;
    const quotes = root.querySelectorAll('blockquote') as NodeListOf<HTMLElement>;
    for (const bq of quotes) {
      if (bq.textContent?.includes(text.slice(0, 40))) return bq;
    }
    return null;
  }

  // Plain paragraph text (skip code fences, HRs, table rows, blank lines)
  if (trimmed.startsWith('```') || trimmed === '---' || trimmed.startsWith('|')) return null;
  if (trimmed.length < 8) return null;

  const plainText = trimmed
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  if (plainText.length < 8) return null;

  const searchText = plainText.slice(0, 50);
  const blocks = Array.from(root.children) as HTMLElement[];
  for (const block of blocks) {
    const tag = block.tagName.toLowerCase();
    // Skip code blocks — their content is code, not matching paragraph text
    if (tag === 'pre') continue;
    if (block.textContent?.includes(searchText)) return block;
  }
  return null;
};

// Find code block element by index (for when cursor is inside a specific code block)
const findCodeBlockElement = (root: HTMLElement, blockIndex: number): HTMLElement | null => {
  // Look for mermaid diagrams, pre/code blocks, or custom code block components
  // We need to find top-level code blocks, not nested ones
  const codeSelector = 'pre, [data-type="mermaidDiagram"], .mermaid-diagram, .mermaid-wrapper, [data-node-view-wrapper]';

  // Get all direct children and their code elements
  const codeBlocks: HTMLElement[] = [];
  const children = Array.from(root.children) as HTMLElement[];

  for (const child of children) {
    // Check if child itself is a code block
    if (child.matches(codeSelector)) {
      codeBlocks.push(child);
    } else {
      // Check if child contains a code block (but only direct descendant)
      const codeChild = child.querySelector(codeSelector);
      if (codeChild) {
        codeBlocks.push(codeChild as HTMLElement);
      }
    }
  }

  if (codeBlocks.length === 0) {
    return null;
  }

  // Return the code block at the specified index
  if (blockIndex >= 0 && blockIndex < codeBlocks.length) {
    return codeBlocks[blockIndex];
  }

  return null;
};

// Compute CSS line height from a textarea's computed style.
const getComputedLineHeight = (textarea: HTMLTextAreaElement): number => {
  const cs = window.getComputedStyle(textarea);
  const fontSize = parseFloat(cs.fontSize);
  return cs.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(cs.lineHeight);
};

// Highlight cursor position in code editor.
// Uses the same lineHeight * lineNumber math as the scroll calculation
// to guarantee the highlight always aligns with the scrolled-to position.
const highlightCodeCursor = (textarea: HTMLTextAreaElement) => {
  const cursorPos = textarea.selectionStart;
  const content = textarea.value;
  const lineNumber = content.slice(0, cursorPos).split('\n').length - 1;

  const lh = getComputedLineHeight(textarea);
  const paddingTop = parseFloat(window.getComputedStyle(textarea).paddingTop);

  const rect = textarea.getBoundingClientRect();

  // lineHeight, paddingTop, scrollTop are all in the textarea's internal
  // coordinate system (pre-zoom in old Chromium, zoomed in Chromium 128+).
  // Convert to viewport pixels via clientHeight → rect.height ratio.
  const visiblePos = lineNumber * lh + paddingTop - textarea.scrollTop;
  const scale = textarea.clientHeight > 0 ? rect.height / textarea.clientHeight : 1;
  const top = rect.top + visiblePos * scale;
  const lineHVp = lh * scale;

  if (top < rect.top || top + lineHVp > rect.bottom) return;

  const highlight = document.createElement('div');
  highlight.className = 'cursor-highlight';
  highlight.style.position = 'fixed';
  highlight.style.left = `${rect.left}px`;
  highlight.style.top = `${top - HIGHLIGHT_PADDING}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${lineHVp + HIGHLIGHT_PADDING * 2}px`;

  document.body.appendChild(highlight);
  window.setTimeout(() => highlight.remove(), TIMING.HIGHLIGHT_DURATION);
};

export function useCodeView(options: UseCodeViewOptions): UseCodeViewReturn {
  const codeView = ref(false);
  const codeContent = ref('');
  const codeEditorRef = ref<HTMLTextAreaElement | null>(null);
  const savedCursorLine = ref(0);
  const savedScrollRatio = ref(0);
  let codeContentSnapshot = '';
  let isToggling = false;

  // Inject styles on module load
  injectHighlightStyles();

  const { getActiveContent, setActiveContent, markAsChanged } = options;

  const toggleCodeView = async (editor: Editor | null | undefined): Promise<void> => {
    if (isToggling) return;
    isToggling = true;
    if (!codeView.value) {
      // ═══════════════════════════════════════════════════════════════════
      // VISUAL → CODE: Insert marker at cursor, convert, find marker position
      // ═══════════════════════════════════════════════════════════════════

      let markerPosition = -1;

      if (editor) {
        const { from } = editor.state.selection;

        // Always try marker mechanism first — it's the most precise way to map
        // the TipTap cursor to a markdown position.
        editor.commands.insertContentAt(from, CURSOR_MARKER, { updateSelection: false });
        const htmlWithMarker = editor.getHTML();
        editor.commands.deleteRange({ from, to: from + CURSOR_MARKER.length });
        const markdownWithMarker = htmlToMarkdown(htmlWithMarker);
        const extracted = extractMarkerPosition(markdownWithMarker);
        markerPosition = extracted.position;
        codeContent.value = extracted.clean;

        // Fallback: if marker landed near the document start but we have a
        // saved position deep in the file, the marker is from a default cursor
        // (posAtDOM failed during code→visual, TipTap cursor stayed at pos 0).
        // Use savedCursorLine instead.
        if (savedCursorLine.value > 5) {
          const markerLine = markerPosition >= 0
            ? getLineFromPosition(codeContent.value, markerPosition)
            : -1;
          if (markerLine <= 2) {
            const lines = codeContent.value.split('\n');
            let pos = 0;
            for (let i = 0; i < savedCursorLine.value && i < lines.length; i++) {
              pos += lines[i].length + 1;
            }
            markerPosition = Math.min(pos, codeContent.value.length);
          }
        }
      } else {
        const html = getActiveContent();
        codeContent.value = htmlToMarkdown(html);
      }

      codeContentSnapshot = codeContent.value;

      // Save scroll ratio as fallback
      const editorContainer = document.querySelector(DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER);
      if (editorContainer) {
        const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
        savedScrollRatio.value = maxScroll > 0 ? editorContainer.scrollTop / maxScroll : 0;
      }

      codeView.value = true;

      // Wait for Vue to mount the textarea (first tick) and apply :value binding (second tick)
      await nextTick();
      await nextTick();

      if (codeEditorRef.value) {
        codeEditorRef.value.focus();

        if (markerPosition >= 0) {
          codeEditorRef.value.setSelectionRange(markerPosition, markerPosition);

          const lineNumber = getLineFromPosition(codeContent.value, markerPosition);
          const lh = getComputedLineHeight(codeEditorRef.value);
          const scrollTarget = Math.max(0, (lineNumber - 5) * lh);
          codeEditorRef.value.scrollTop = scrollTarget;
        } else {
          // Fallback: use scroll ratio
          const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
          const targetScroll = Math.round(savedScrollRatio.value * codeMaxScroll);
          codeEditorRef.value.scrollTop = targetScroll;
        }

        // Highlight cursor position
        window.setTimeout(() => {
          if (codeEditorRef.value) {
            highlightCodeCursor(codeEditorRef.value);
          }
          isToggling = false;
        }, TIMING.HIGHLIGHT_DELAY);
      } else {
        isToggling = false;
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // CODE → VISUAL: Use line-based cursor restoration (no marker injection)
      //
      // Previously, a CURSOR_MARKER was injected into the markdown text at
      // the cursor position. This corrupted image/link syntax when the
      // cursor was inside e.g. ![alt](url), and zero-width spaces persisted
      // invisibly (#37). Now we always use line-based positioning which is
      // safe for all markdown constructs.
      // ═══════════════════════════════════════════════════════════════════

      let cursorLine = 0;
      let codeBlockIndex = -1;
      let lineInCodeBlock = -1; // line offset within the code block (for drill-down)

      if (codeEditorRef.value) {
        const cursorPos = codeEditorRef.value.selectionStart;
        cursorLine = getLineFromPosition(codeContent.value, cursorPos);

        // Save scroll ratio as fallback
        const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
        savedScrollRatio.value = codeMaxScroll > 0 ? codeEditorRef.value.scrollTop / codeMaxScroll : 0;

        // Check if cursor is inside a code block
        const codeBlockInfo = getCodeBlockInfo(codeContent.value, cursorPos);
        if (codeBlockInfo.inside) {
          codeBlockIndex = codeBlockInfo.blockIndex;
          // Find the exact line offset within this code block using parseMarkdownBlocks
          const mdBlocks = parseMarkdownBlocks(codeContent.value);
          const codeBlocks = mdBlocks.filter(b => b.type === 'code' || b.type === 'mermaid');
          if (codeBlockIndex >= 0 && codeBlockIndex < codeBlocks.length) {
            // -1 to skip the opening ``` line
            lineInCodeBlock = cursorLine - codeBlocks[codeBlockIndex].startLine - 1;
          }
        }
      }

      savedCursorLine.value = cursorLine;

      const contentChanged = codeContent.value !== codeContentSnapshot;

      if (contentChanged) {
        const html = markdownToHtml(codeContent.value);
        setActiveContent(html);
        markAsChanged();
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

          // Find target element: text match first, then block map (structural)
          let targetElement: HTMLElement | null;
          if (codeBlockIndex >= 0) {
            targetElement = findCodeBlockElement(proseMirror, codeBlockIndex);
          } else {
            targetElement = findElementByText(proseMirror, codeContent.value, savedCursorLine.value)
              || findElementByBlockMap(proseMirror, codeContent.value, savedCursorLine.value);
          }

          if (targetElement) {
            // Set TipTap cursor on the target element so the marker mechanism
            // preserves position when toggling back to code view.
            if (editor) {
              try {
                let pos = editor.view.posAtDOM(targetElement, 0);
                // For code blocks with a line offset, advance into the code
                if (codeBlockIndex >= 0 && lineInCodeBlock > 0) {
                  const codeEl = targetElement.querySelector('code');
                  if (codeEl) {
                    const codeText = codeEl.textContent || '';
                    const codeLines = codeText.split('\n');
                    let charOffset = 0;
                    for (let li = 0; li < lineInCodeBlock && li < codeLines.length; li++) {
                      charOffset += codeLines[li].length + 1;
                    }
                    const codePos = editor.view.posAtDOM(codeEl, 0);
                    pos = Math.min(codePos + charOffset, editor.state.doc.content.size);
                  }
                }
                editor.commands.setTextSelection(pos);
              } catch { /* posAtDOM can throw if DOM is not in sync */ }
            }

            // For code blocks with a known line offset, drill down to the
            // specific line within the <pre> and highlight just that line.
            if (codeBlockIndex >= 0 && lineInCodeBlock > 0) {
              const codeEl = targetElement.querySelector('code') as HTMLElement | null;
              const block = codeEl || targetElement;
              const blockCs = window.getComputedStyle(block);
              const codeLh = blockCs.lineHeight === 'normal'
                ? parseFloat(blockCs.fontSize) * 1.2
                : parseFloat(blockCs.lineHeight);
              const blockPadTop = parseFloat(window.getComputedStyle(targetElement).paddingTop) || 0;

              // Scroll: first to the code block, then adjust for the line offset
              scrollContainerToElement(editorContainer, targetElement, SCROLL_OFFSET);
              const extraScroll = Math.max(0, lineInCodeBlock * codeLh + blockPadTop - SCROLL_OFFSET);
              editorContainer.scrollTop += extraScroll;

              // Highlight the specific line within the code block
              requestAnimationFrame(() => {
                clearVisualHighlight();
                const blockRect = targetElement!.getBoundingClientRect();
                const lineTop = blockRect.top + blockPadTop + lineInCodeBlock * codeLh;
                const highlight = document.createElement('div');
                highlight.className = 'cursor-highlight';
                highlight.style.position = 'fixed';
                highlight.style.left = `${blockRect.left}px`;
                highlight.style.top = `${lineTop - HIGHLIGHT_PADDING}px`;
                highlight.style.width = `${blockRect.width}px`;
                highlight.style.height = `${codeLh + HIGHLIGHT_PADDING * 2}px`;
                document.body.appendChild(highlight);
                activeHighlightElement = highlight;
                highlightTimer = window.setTimeout(() => {
                  highlight.remove();
                  if (activeHighlightElement === highlight) activeHighlightElement = null;
                  highlightTimer = null;
                }, TIMING.HIGHLIGHT_DURATION);
                isToggling = false;
              });
            } else {
              scrollContainerToElement(editorContainer, targetElement, SCROLL_OFFSET);
              requestAnimationFrame(() => { highlightVisualElement(targetElement!); isToggling = false; });
            }
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
    codeContent.value = value;
    markAsChanged();
  };

  return {
    codeView,
    codeContent,
    codeEditorRef,
    toggleCodeView,
    onCodeContentUpdate,
  };
}
