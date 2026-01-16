import { ref, nextTick, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { htmlToMarkdown, markdownToHtml, generateSlug } from '../utils/markdown-converter';

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

type CursorLineType = 'heading' | 'list' | 'code' | 'paragraph' | 'empty';

interface HeadingAnchor {
  id: string;
  level: number;
}

const MIN_SEARCH_TEXT_LENGTH = 3;

let activeHighlightElement: HTMLElement | null = null;
let highlightTimer: number | null = null;

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
  const content = element.closest('.editor-content') as HTMLElement | null;
  const contentRect = content ? content.getBoundingClientRect() : element.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  return {
    left: contentRect.left,
    top: targetRect.top,
    width: contentRect.width,
    height: Math.max(24, targetRect.height),
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
  }, 1000);
};

const getActiveEditorContainer = (): HTMLElement | null => {
  return document.querySelector('.editor-pane.active .editor-container') as HTMLElement | null;
};

const getFallbackEditorContainer = (): HTMLElement | null => {
  const containers = document.querySelectorAll('.editor-container');
  if (containers.length === 1) {
    return containers[0] as HTMLElement;
  }
  return null;
};

const getCursorLineIndex = (content: string, cursorPos: number): number => {
  if (cursorPos <= 0) return 0;
  return content.slice(0, cursorPos).split('\n').length - 1;
};

const normalizeText = (value: string): string => {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
};

const normalizeLineForSearch = (line: string): string => {
  let text = line.trim();
  if (!text) return '';

  text = text.replace(/^(#{1,6})\s+/, '');
  text = text.replace(/^(\s*[-*+]|\s*\d+\.)\s+/, '');
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/~~([^~]+)~~/g, '$1');

  return text.replace(/\s+/g, ' ').trim();
};

const buildFenceMap = (lines: string[], maxIndex: number): boolean[] => {
  let inFence = false;
  const map: boolean[] = [];
  const lastIndex = Math.min(maxIndex, lines.length - 1);

  for (let i = 0; i <= lastIndex; i++) {
    if (/^```/.test(lines[i])) {
      inFence = !inFence;
    }
    map[i] = inFence;
  }

  return map;
};

const getCursorLineInfo = (
  content: string,
  cursorPos: number
): { text: string; type: CursorLineType; lineIndex: number } => {
  const lines = content.split('\n');
  if (lines.length === 0) {
    return { text: '', type: 'empty', lineIndex: 0 };
  }

  const lineIndex = Math.min(lines.length - 1, Math.max(0, getCursorLineIndex(content, cursorPos)));
  const line = lines[lineIndex] ?? '';
  const trimmed = line.trim();

  if (!trimmed) {
    return { text: '', type: 'empty', lineIndex };
  }

  const inFenceByLine = buildFenceMap(lines, lineIndex);
  const inFence = inFenceByLine[lineIndex];

  if (inFence && !/^```/.test(trimmed)) {
    return { text: normalizeLineForSearch(trimmed), type: 'code', lineIndex };
  }

  if (/^```/.test(trimmed)) {
    return { text: '', type: 'code', lineIndex };
  }

  if (/^(#{1,6})\s+/.test(trimmed)) {
    return { text: normalizeLineForSearch(trimmed), type: 'heading', lineIndex };
  }

  if (/^(\s*[-*+]|\s*\d+\.)\s+/.test(trimmed)) {
    return { text: normalizeLineForSearch(trimmed), type: 'list', lineIndex };
  }

  return { text: normalizeLineForSearch(trimmed), type: 'paragraph', lineIndex };
};

const findNearestHeading = (content: string, cursorPos: number): HeadingAnchor | null => {
  const lines = content.split('\n');
  if (lines.length === 0) return null;

  const lineIndex = Math.min(lines.length - 1, Math.max(0, getCursorLineIndex(content, cursorPos)));
  const inFenceByLine = buildFenceMap(lines, lineIndex);

  for (let i = lineIndex; i >= 0; i--) {
    if (inFenceByLine[i]) continue;
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const headingText = match[2].trim();
      if (!headingText) continue;
      const slug = generateSlug(headingText);
      if (!slug) continue;
      return { id: slug, level: match[1].length };
    }
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
  return container.querySelector('.ProseMirror') as HTMLElement | null;
};

const getHeadingLevel = (element: HTMLElement): number | null => {
  const match = element.tagName.match(/^H([1-6])$/i);
  return match ? parseInt(match[1], 10) : null;
};

const findTargetElement = (
  root: HTMLElement,
  heading: HeadingAnchor | null,
  lineText: string,
  lineType: CursorLineType
): HTMLElement | null => {
  const blocks = Array.from(root.children) as HTMLElement[];
  if (blocks.length === 0) return null;

  let headingElement: HTMLElement | null = null;
  let startIndex = 0;
  let endIndex = blocks.length;

  if (heading) {
    headingElement = root.querySelector(`#${heading.id}`) as HTMLElement | null;
    if (headingElement) {
      const headingIndex = blocks.indexOf(headingElement);
      if (headingIndex !== -1) {
        startIndex = lineType === 'heading' ? headingIndex : Math.min(headingIndex + 1, blocks.length);
        for (let i = headingIndex + 1; i < blocks.length; i++) {
          const level = getHeadingLevel(blocks[i]);
          if (level !== null && level <= heading.level) {
            endIndex = i;
            break;
          }
        }
      }
    }
  }

  if (lineType === 'heading' && headingElement) {
    return headingElement;
  }

  const searchBlocks = blocks.slice(startIndex, endIndex);
  if (lineText && lineText.length >= MIN_SEARCH_TEXT_LENGTH) {
    const needle = normalizeText(lineText);
    for (const block of searchBlocks) {
      const hay = normalizeText(block.textContent || '');
      if (hay.includes(needle)) {
        return block;
      }
    }
  }

  if (headingElement) {
    return headingElement;
  }

  return blocks[Math.min(startIndex, blocks.length - 1)] || blocks[0] || null;
};

const findHighlightTarget = (container: HTMLElement): HTMLElement | null => {
  const proseMirror = getProseMirrorRoot(container);
  if (!proseMirror) return null;

  const rect = container.getBoundingClientRect();
  const targetX = Math.min(rect.left + 40, rect.right - 1);
  const targetY = rect.top + Math.min(container.clientHeight * 0.3, 120);
  const elementAtPoint = document.elementFromPoint(targetX, targetY) as HTMLElement | null;

  if (elementAtPoint && container.contains(elementAtPoint)) {
    let current: HTMLElement | null = elementAtPoint;
    while (current && current !== proseMirror) {
      if (current.parentElement === proseMirror) {
        return current;
      }
      current = current.parentElement;
    }
  }

  return proseMirror.firstElementChild as HTMLElement | null;
};

// Highlight cursor position in code editor
const highlightCodeCursor = (textarea: HTMLTextAreaElement) => {
  const cursorPos = textarea.selectionStart;
  const content = textarea.value;

  // Find the line containing the cursor
  const textBefore = content.slice(0, cursorPos);
  const lineNumber = textBefore.split('\n').length - 1;

  // Create a temporary overlay element
  const lineHeight = 22.4; // Should match CSS
  const paddingTop = 16; // Padding from CodeEditor.vue

  const highlight = document.createElement('div');
  highlight.className = 'cursor-highlight';

  const textareaRect = textarea.getBoundingClientRect();
  highlight.style.position = 'absolute';
  highlight.style.left = `${textareaRect.left + 16}px`;
  highlight.style.top = `${textareaRect.top + paddingTop + (lineNumber * lineHeight) - textarea.scrollTop}px`;
  highlight.style.width = `${textareaRect.width - 32}px`;
  highlight.style.height = `${lineHeight}px`;

  document.body.appendChild(highlight);
  setTimeout(() => highlight.remove(), 1000);
};

export function useCodeView(options: UseCodeViewOptions): UseCodeViewReturn {
  const codeView = ref(false);
  const codeContent = ref('');
  const codeEditorRef = ref<HTMLTextAreaElement | null>(null);
  const savedScrollRatio = ref(0);
  const savedCursorText = ref('');
  const savedCursorHeading = ref<HeadingAnchor | null>(null);
  const savedCursorLineText = ref('');
  const savedCursorLineType = ref<CursorLineType>('paragraph');

  // Inject styles on module load
  injectHighlightStyles();

  const { getActiveContent, setActiveContent, markAsChanged } = options;

  const toggleCodeView = async (editor: Editor | null | undefined): Promise<void> => {
    if (!codeView.value) {
      // Switching to code view - convert HTML to Markdown
      const html = getActiveContent();
      codeContent.value = htmlToMarkdown(html);

      // Get the text at cursor position from TipTap for syncing
      savedCursorText.value = '';
      if (editor) {
        const { from } = editor.state.selection;
        const $pos = editor.state.doc.resolve(from);

        for (let depth = $pos.depth; depth >= 0; depth--) {
          const node = $pos.node(depth);
          if (node.type.name === 'heading') {
            const level = node.attrs.level || 1;
            const prefix = '#'.repeat(level) + ' ';
            const text = node.textContent;
            savedCursorText.value = prefix + text;
            break;
          } else if (node.type.name === 'paragraph' && node.textContent.trim()) {
            savedCursorText.value = node.textContent.trim().slice(0, 50);
            break;
          } else if (node.type.name === 'codeBlock') {
            savedCursorText.value = '```';
            break;
          } else if (node.type.name === 'listItem' && node.textContent.trim()) {
            savedCursorText.value = node.textContent.trim().slice(0, 50);
            break;
          }
        }
      }

      // Save current scroll ratio as fallback (use active pane selector for split view)
      const editorContainer = document.querySelector('.editor-pane.active .editor-container');
      if (editorContainer) {
        const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
        savedScrollRatio.value = maxScroll > 0 ? editorContainer.scrollTop / maxScroll : 0;
      }

      codeView.value = true;

      // After switching, find and set cursor position in code editor
      await nextTick();
      await nextTick();
      if (codeEditorRef.value) {
        let cursorSet = false;

        if (savedCursorText.value) {
          const searchText = savedCursorText.value;
          const pos = codeContent.value.indexOf(searchText);

          if (pos !== -1) {
            codeEditorRef.value.focus();
            codeEditorRef.value.setSelectionRange(pos, pos);

            const textBefore = codeContent.value.slice(0, pos);
            const lineNumber = textBefore.split('\n').length;
            const lineHeight = 22.4;
            const scrollTarget = Math.max(0, (lineNumber - 5) * lineHeight);
            codeEditorRef.value.scrollTop = scrollTarget;
            cursorSet = true;
          }
        }

        if (!cursorSet) {
          const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
          const targetScroll = Math.round(savedScrollRatio.value * codeMaxScroll);
          codeEditorRef.value.scrollTop = targetScroll;
          codeEditorRef.value.focus();
        }

        // Highlight cursor position after a brief delay for DOM to settle
        setTimeout(() => {
          if (codeEditorRef.value) {
            highlightCodeCursor(codeEditorRef.value);
          }
        }, 100);
      }
    } else {
      // Switching back to visual view
      if (codeEditorRef.value) {
        // Save scroll ratio for position restoration
        const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
        savedScrollRatio.value = codeMaxScroll > 0 ? codeEditorRef.value.scrollTop / codeMaxScroll : 0;
        const cursorPos = codeEditorRef.value.selectionStart;
        const lineInfo = getCursorLineInfo(codeContent.value, cursorPos);
        savedCursorLineText.value = lineInfo.text;
        savedCursorLineType.value = lineInfo.type;
        savedCursorHeading.value = findNearestHeading(codeContent.value, cursorPos);
      } else {
        savedCursorHeading.value = null;
        savedCursorLineText.value = '';
        savedCursorLineType.value = 'paragraph';
      }

      const html = markdownToHtml(codeContent.value);
      setActiveContent(html);
      markAsChanged();
      codeView.value = false;

      // After switching back to visual, the editor component remounts and creates a new editor instance.
      // The editor passed to this function is the old instance that gets destroyed.
      // We need to wait for the new editor to be ready and use DOM-based scrolling instead.
      // Content is already set via setActiveContent() which updates the tab content.

      // Wait for DOM to settle and use scroll ratio to restore position
      await nextTick();
      await nextTick();

      const scheduleVisualRestore = () => {
        let attempts = 0;
        const maxAttempts = 20;
        let lastScrollHeight = 0;
        let stableTicks = 0;

        const tryRestore = () => {
          const editorContainer = getActiveEditorContainer() || (attempts >= maxAttempts - 1
            ? getFallbackEditorContainer()
            : null);

          if (!editorContainer) {
            if (attempts < maxAttempts) {
              attempts += 1;
              setTimeout(tryRestore, 60);
            }
            return;
          }

          const proseMirror = getProseMirrorRoot(editorContainer);
          if (!proseMirror || proseMirror.childElementCount === 0) {
            if (attempts < maxAttempts) {
              attempts += 1;
              setTimeout(tryRestore, 60);
            }
            return;
          }

          const scrollHeight = editorContainer.scrollHeight;
          if (scrollHeight !== lastScrollHeight) {
            lastScrollHeight = scrollHeight;
            stableTicks = 0;
          } else {
            stableTicks += 1;
          }

          const maxScroll = scrollHeight - editorContainer.clientHeight;
          const canScroll = maxScroll > 0;

          if (!canScroll && stableTicks < 2 && attempts < maxAttempts) {
            attempts += 1;
            setTimeout(tryRestore, 60);
            return;
          }

          const hasSearchText = savedCursorLineText.value.length >= MIN_SEARCH_TEXT_LENGTH;
          const wantsTarget = hasSearchText || savedCursorLineType.value === 'heading' || savedScrollRatio.value === 0;
          const targetElement = wantsTarget
            ? findTargetElement(proseMirror, savedCursorHeading.value, savedCursorLineText.value, savedCursorLineType.value)
            : null;

          if (targetElement) {
            scrollContainerToElement(editorContainer, targetElement, 80);
            requestAnimationFrame(() => highlightVisualElement(targetElement));
            return;
          }

          if (canScroll) {
            const targetScroll = Math.round(savedScrollRatio.value * Math.max(0, maxScroll));
            editorContainer.scrollTop = targetScroll;
            requestAnimationFrame(() => {
              const highlightTarget = findHighlightTarget(editorContainer);
              if (highlightTarget) {
                highlightVisualElement(highlightTarget);
              }
            });
            return;
          }

          const fallbackTarget = findHighlightTarget(editorContainer) || (proseMirror.firstElementChild as HTMLElement | null);
          if (fallbackTarget) {
            highlightVisualElement(fallbackTarget);
            return;
          }

          if (attempts < maxAttempts) {
            attempts += 1;
            setTimeout(tryRestore, 60);
          }
        };

        tryRestore();
      };

      // Use a small delay to ensure the new editor has fully mounted
      setTimeout(scheduleVisualRestore, 150);
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
