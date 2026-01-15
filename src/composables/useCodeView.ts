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

export function useCodeView(options: UseCodeViewOptions): UseCodeViewReturn {
  const codeView = ref(false);
  const codeContent = ref('');
  const codeEditorRef = ref<HTMLTextAreaElement | null>(null);
  const savedScrollRatio = ref(0);
  const savedCursorText = ref('');

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

      // Save current scroll ratio as fallback
      const editorContainer = document.querySelector('.editor-container');
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

      // Find and scroll to the matching content in visual editor
      await nextTick();
      await nextTick();
      await nextTick();

      let scrollDone = false;
      if (savedCursorText.value && editor) {
        const searchText = savedCursorText.value;

        let foundPos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (foundPos !== -1) return false;

          if (node.isBlock && node.textContent) {
            const nodeText = node.textContent.trim();
            if (nodeText.includes(searchText) || searchText.includes(nodeText.slice(0, 30))) {
              foundPos = pos;
              return false;
            }
          }
          return true;
        });

        if (foundPos !== -1) {
          editor.commands.setTextSelection(foundPos + 1);

          await nextTick();
          const editorContainer = document.querySelector('.editor-container');
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0 && editorContainer) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = editorContainer.getBoundingClientRect();

            if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
              const scrollOffset = rect.top - containerRect.top + editorContainer.scrollTop - 100;
              editorContainer.scrollTop = Math.max(0, scrollOffset);
            }
          }
          scrollDone = true;
        }
      }

      if (!scrollDone) {
        const editorContainer = document.querySelector('.editor-container');
        if (editorContainer) {
          const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
          const targetScroll = Math.round(savedScrollRatio.value * maxScroll);
          editorContainer.scrollTop = targetScroll;
        }
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
