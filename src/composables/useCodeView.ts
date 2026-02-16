import { ref, nextTick, type Ref } from 'vue';
import type { Editor } from '@tiptap/vue-3';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';

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
  const content = element.closest('.editor-content') as HTMLElement | null;
  const contentRect = content ? content.getBoundingClientRect() : element.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  const padding = 4; 
  return {
    left: contentRect.left,
    top: targetRect.top - padding,
    width: contentRect.width,
    height: Math.max(24, targetRect.height) + (padding * 2),
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

const scrollContainerToElement = (container: HTMLElement, target: HTMLElement, offset: number) => {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = targetRect.top - containerRect.top + container.scrollTop - offset;
  container.scrollTop = Math.max(0, targetTop);
};

const getProseMirrorRoot = (container: HTMLElement): HTMLElement | null => {
  return container.querySelector('.ProseMirror') as HTMLElement | null;
};

// Find element containing the cursor marker in visual editor
const findMarkerElement = (root: HTMLElement): { element: HTMLElement; textNode: Text; offset: number } | null => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const idx = node.textContent?.indexOf(CURSOR_MARKER) ?? -1;
    if (idx !== -1) {
      // Find the closest block-level parent for highlighting
      let parent = node.parentElement;
      while (parent && parent !== root) {
        const display = getComputedStyle(parent).display;
        if (display === 'block' || display === 'list-item' || parent.parentElement === root) {
          return { element: parent, textNode: node, offset: idx };
        }
        parent = parent.parentElement;
      }
      // Fallback to direct child of root
      parent = node.parentElement;
      while (parent && parent.parentElement !== root) {
        parent = parent.parentElement;
      }
      if (parent) {
        return { element: parent, textNode: node, offset: idx };
      }
    }
  }
  return null;
};

// Remove marker from DOM tree
const removeMarkerFromDOM = (root: HTMLElement): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    if (node.textContent?.includes(CURSOR_MARKER)) {
      node.textContent = node.textContent.replace(CURSOR_MARKER, '');
    }
  }
};

// Find element at approximate line position (fallback)
const findElementAtLine = (root: HTMLElement, targetLine: number, totalLines: number): HTMLElement | null => {
  const blocks = Array.from(root.children) as HTMLElement[];
  if (blocks.length === 0) return null;

  // Approximate: distribute lines evenly across blocks
  const ratio = totalLines > 0 ? targetLine / totalLines : 0;
  const targetIndex = Math.min(Math.floor(ratio * blocks.length), blocks.length - 1);

  return blocks[Math.max(0, targetIndex)] || blocks[0];
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

  // Fallback to first code block if index is out of range
  return codeBlocks[0];
};

// Highlight cursor position in code editor
const highlightCodeCursor = (textarea: HTMLTextAreaElement) => {
  const cursorPos = textarea.selectionStart;
  const content = textarea.value;

  // Find the line containing the cursor
  const textBefore = content.slice(0, cursorPos);
  const lineNumber = textBefore.split('\n').length - 1;

  // Get actual line height from computed styles
  const computedStyle = window.getComputedStyle(textarea);
  const fontSize = parseFloat(computedStyle.fontSize);
  const lineHeightValue = computedStyle.lineHeight;
  const lineHeight = lineHeightValue === 'normal'
    ? fontSize * 1.2
    : parseFloat(lineHeightValue);

  const paddingTop = parseFloat(computedStyle.paddingTop);
  const paddingLeft = parseFloat(computedStyle.paddingLeft);
  const padding = 4; // Vertical padding for highlight box

  const highlight = document.createElement('div');
  highlight.className = 'cursor-highlight';

  const textareaRect = textarea.getBoundingClientRect();

  // Calculate position of line relative to viewport
  // Line N starts at: paddingTop + N * lineHeight (from textarea content top)
  // Visible position: that minus scrollTop gives position relative to textarea visible area
  const lineTopInContent = lineNumber * lineHeight;
  const lineTopVisible = lineTopInContent - textarea.scrollTop;
  const lineTopInViewport = textareaRect.top + paddingTop + lineTopVisible;

  highlight.style.position = 'fixed';
  highlight.style.left = `${textareaRect.left + paddingLeft}px`;
  highlight.style.top = `${lineTopInViewport - padding}px`;
  highlight.style.width = `${textareaRect.width - (paddingLeft * 2)}px`;
  highlight.style.height = `${lineHeight + (padding * 2)}px`;

  document.body.appendChild(highlight);
  setTimeout(() => highlight.remove(), 1000);
};

export function useCodeView(options: UseCodeViewOptions): UseCodeViewReturn {
  const codeView = ref(false);
  const codeContent = ref('');
  const codeEditorRef = ref<HTMLTextAreaElement | null>(null);
  const savedCursorLine = ref(0);
  const savedScrollRatio = ref(0);
  let codeContentSnapshot = '';

  // Inject styles on module load
  injectHighlightStyles();

  const { getActiveContent, setActiveContent, markAsChanged } = options;

  const toggleCodeView = async (editor: Editor | null | undefined): Promise<void> => {
    if (!codeView.value) {
      // ═══════════════════════════════════════════════════════════════════
      // VISUAL → CODE: Insert marker at cursor, convert, find marker position
      // ═══════════════════════════════════════════════════════════════════

      let markerPosition = -1;
      let markdownWithMarker = '';

      if (editor) {
        const { from } = editor.state.selection;

        // Insert marker at cursor position temporarily
        editor.commands.insertContentAt(from, CURSOR_MARKER, { updateSelection: false });

        // Get HTML with marker
        const htmlWithMarker = editor.getHTML();

        // Remove marker from editor (restore original state)
        editor.commands.deleteRange({ from, to: from + CURSOR_MARKER.length });

        // Convert to markdown - marker should pass through
        markdownWithMarker = htmlToMarkdown(htmlWithMarker);

        // Extract marker position from markdown
        const extracted = extractMarkerPosition(markdownWithMarker);
        markerPosition = extracted.position;
        codeContent.value = extracted.clean;
      } else {
        const html = getActiveContent();
        codeContent.value = htmlToMarkdown(html);
      }

      codeContentSnapshot = codeContent.value;

      // Save scroll ratio as fallback
      const editorContainer = document.querySelector('.editor-pane.active .editor-container');
      if (editorContainer) {
        const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
        savedScrollRatio.value = maxScroll > 0 ? editorContainer.scrollTop / maxScroll : 0;
      }

      codeView.value = true;

      // Set cursor position in code editor
      await nextTick();
      await nextTick();

      if (codeEditorRef.value) {
        codeEditorRef.value.focus();

        if (markerPosition !== -1) {
          // Set cursor at marker position
          codeEditorRef.value.setSelectionRange(markerPosition, markerPosition);

          // Scroll to show cursor line
          const lineNumber = getLineFromPosition(codeContent.value, markerPosition);
          const lineHeight = 22.4;
          const scrollTarget = Math.max(0, (lineNumber - 5) * lineHeight);
          codeEditorRef.value.scrollTop = scrollTarget;
        } else {
          // Fallback: use scroll ratio
          const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
          const targetScroll = Math.round(savedScrollRatio.value * codeMaxScroll);
          codeEditorRef.value.scrollTop = targetScroll;
        }

        // Highlight cursor position
        setTimeout(() => {
          if (codeEditorRef.value) {
            highlightCodeCursor(codeEditorRef.value);
          }
        }, 100);
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════
      // CODE → VISUAL: Insert marker at cursor, convert, find marker in DOM
      // ═══════════════════════════════════════════════════════════════════

      let cursorLine = 0;
      let totalLines = 1;
      let markdownWithMarker = codeContent.value;
      let useMarker = false;
      let codeBlockIndex = -1;

      if (codeEditorRef.value) {
        const cursorPos = codeEditorRef.value.selectionStart;
        cursorLine = getLineFromPosition(codeContent.value, cursorPos);
        totalLines = codeContent.value.split('\n').length;

        // Save scroll ratio as fallback
        const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
        savedScrollRatio.value = codeMaxScroll > 0 ? codeEditorRef.value.scrollTop / codeMaxScroll : 0;

        // Check if cursor is inside a code block
        const codeBlockInfo = getCodeBlockInfo(codeContent.value, cursorPos);

        if (!codeBlockInfo.inside) {
          // Not inside code block - use marker
          useMarker = true;
          markdownWithMarker =
            codeContent.value.slice(0, cursorPos) +
            CURSOR_MARKER +
            codeContent.value.slice(cursorPos);
        } else {
          // Inside code block - remember which one
          codeBlockIndex = codeBlockInfo.blockIndex;
        }
      }

      savedCursorLine.value = cursorLine;

      const contentChanged = codeContent.value !== codeContentSnapshot;

      if (!contentChanged) {
        // No changes — skip re-conversion to avoid marker/DOM mutation race conditions.
        codeView.value = false;

        await nextTick();
        await nextTick();

        setTimeout(() => {
          const editorContainer = getActiveEditorContainer() || getFallbackEditorContainer();
          if (!editorContainer) return;

          const proseMirror = getProseMirrorRoot(editorContainer);
          if (proseMirror && proseMirror.childElementCount > 0) {
            const targetElement = useMarker
              ? findElementAtLine(proseMirror, savedCursorLine.value, totalLines)
              : findCodeBlockElement(proseMirror, codeBlockIndex);

            if (targetElement) {
              scrollContainerToElement(editorContainer, targetElement, 80);
              requestAnimationFrame(() => highlightVisualElement(targetElement));
              return;
            }
          }

          // Last resort: scroll ratio
          const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
          if (maxScroll > 0) {
            editorContainer.scrollTop = Math.round(savedScrollRatio.value * maxScroll);
          }
        }, 150);
      } else {
        const html = markdownToHtml(markdownWithMarker);
        setActiveContent(html);
        markAsChanged();
        codeView.value = false;

        await nextTick();
        await nextTick();

        const scheduleVisualRestore = () => {
          let attempts = 0;
          const maxAttempts = 20;

          const tryRestore = () => {
            const editorContainer = getActiveEditorContainer() ||
              (attempts >= maxAttempts - 1 ? getFallbackEditorContainer() : null);

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

            // Only try to find marker if we inserted one (not inside code block)
            if (useMarker) {
              const markerInfo = findMarkerElement(proseMirror);

              if (markerInfo) {
                // Found marker - scroll to element and highlight
                scrollContainerToElement(editorContainer, markerInfo.element, 80);

                // Remove marker from DOM
                removeMarkerFromDOM(proseMirror);

                // Also update the content without marker
                const cleanHtml = proseMirror.innerHTML;
                setActiveContent(cleanHtml);

                requestAnimationFrame(() => highlightVisualElement(markerInfo.element));
                return;
              }
            }

            // Marker not found or not used - use appropriate fallback
            // If cursor was in code block, try to find the specific code block element by index
            const fallbackElement = useMarker
              ? findElementAtLine(proseMirror, savedCursorLine.value, totalLines)
              : findCodeBlockElement(proseMirror, codeBlockIndex);

            if (fallbackElement) {
              scrollContainerToElement(editorContainer, fallbackElement, 80);
              requestAnimationFrame(() => highlightVisualElement(fallbackElement));
              return;
            }

            // Last resort: scroll ratio
            const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
            if (maxScroll > 0) {
              editorContainer.scrollTop = Math.round(savedScrollRatio.value * maxScroll);
            }

            const firstElement = proseMirror.firstElementChild as HTMLElement | null;
            if (firstElement) {
              requestAnimationFrame(() => highlightVisualElement(firstElement));
            }
          };

          tryRestore();
        };

        setTimeout(scheduleVisualRestore, 150);
      }
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
