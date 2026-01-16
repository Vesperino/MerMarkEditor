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

// Inject CSS for cursor highlight animation
const injectHighlightStyles = () => {
  const styleId = 'cursor-highlight-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes cursor-pulse {
      0% {
        background-color: rgba(59, 130, 246, 0.5);
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
      }
      50% {
        background-color: rgba(59, 130, 246, 0.3);
        box-shadow: 0 0 15px 5px rgba(59, 130, 246, 0.3);
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
      z-index: 10;
    }
    .cursor-highlight-line {
      animation: cursor-pulse 1s ease-out forwards !important;
      position: relative;
      border-radius: 3px;
    }
    .ProseMirror .cursor-highlight-line {
      background-color: rgba(59, 130, 246, 0.5) !important;
      box-shadow: 0 0 15px 5px rgba(59, 130, 246, 0.3) !important;
      animation: cursor-pulse 1s ease-out forwards !important;
    }
  `;
  document.head.appendChild(style);
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
      savedCursorText.value = '';
      if (codeEditorRef.value) {
        const cursorPos = codeEditorRef.value.selectionStart;
        const content = codeContent.value;

        const textBefore = content.slice(0, cursorPos);
        const lineStart = textBefore.lastIndexOf('\n') + 1;
        const lineEnd = content.indexOf('\n', cursorPos);
        const currentLine = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);

        const headingMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          savedCursorText.value = headingMatch[2].trim();
        } else if (currentLine.trim()) {
          savedCursorText.value = currentLine.trim().slice(0, 50);
        }

        const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
        savedScrollRatio.value = codeMaxScroll > 0 ? codeEditorRef.value.scrollTop / codeMaxScroll : 0;
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

      // Use setTimeout to ensure the new editor has fully mounted
      setTimeout(() => {
        const editorContainer = document.querySelector('.editor-pane.active .editor-container');
        if (editorContainer) {
          const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;

          if (savedCursorText.value) {
            // Try to find the text in the DOM and scroll to it
            const proseMirror = editorContainer.querySelector('.ProseMirror');
            if (proseMirror) {
              // Search in block-level elements (handles text split across nodes)
              const blockElements = proseMirror.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre');
              let foundElement: Element | null = null;
              const searchText = savedCursorText.value.toLowerCase();

              // Try exact match first, then partial match
              for (const element of blockElements) {
                const elementText = element.textContent?.toLowerCase() || '';
                if (elementText.includes(searchText)) {
                  foundElement = element;
                  break;
                }
              }

              // If not found, try with first 20 chars
              if (!foundElement && searchText.length > 20) {
                const shortSearch = searchText.slice(0, 20);
                for (const element of blockElements) {
                  const elementText = element.textContent?.toLowerCase() || '';
                  if (elementText.includes(shortSearch)) {
                    foundElement = element;
                    break;
                  }
                }
              }

              if (foundElement) {
                const rect = foundElement.getBoundingClientRect();
                const containerRect = editorContainer.getBoundingClientRect();
                const scrollOffset = rect.top - containerRect.top + editorContainer.scrollTop - 100;
                editorContainer.scrollTop = Math.max(0, scrollOffset);

                // Highlight the found element
                foundElement.classList.add('cursor-highlight-line');
                setTimeout(() => {
                  foundElement?.classList.remove('cursor-highlight-line');
                }, 1000);
                return;
              }
            }
          }

          // Fallback: use scroll ratio
          const targetScroll = Math.round(savedScrollRatio.value * maxScroll);
          editorContainer.scrollTop = targetScroll;
        }
      }, 150);
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
