import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import {
  decodeSafeHtmlSource,
  encodeSafeHtmlSource,
  safeHtmlRenderableTagSourceLines,
  safeHtmlSourceKey,
  sanitizeSafeHtml,
} from '../utils/safe-html';

export const SafeHtmlBlockExtension = Node.create({
  name: 'safeHtmlBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      raw: {
        default: '',
        parseHTML: element => decodeSafeHtmlSource(element.getAttribute('data-safe-html-block') ?? ''),
        renderHTML: attributes => ({ 'data-safe-html-block': encodeSafeHtmlSource(String(attributes.raw ?? '')) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-safe-html-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'safe-html-block', contenteditable: 'false' })];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'safe-html-block';
      dom.contentEditable = 'false';
      const raw = String(node.attrs.raw ?? '');
      dom.innerHTML = sanitizeSafeHtml(raw);
      dom.dataset.safeHtmlCursorLine = '0';
      dom.dataset.safeHtmlSourceKey = safeHtmlSourceKey(raw);

      const sourceLines = safeHtmlRenderableTagSourceLines(raw);
      const rendered = dom.querySelectorAll('p, strong, em, br, a, img, details, summary');
      rendered.forEach((element, index) => {
        if (sourceLines[index] !== undefined) {
          (element as HTMLElement).dataset.safeHtmlSourceLine = String(sourceLines[index]);
        }
      });

      const rememberClickedLine = (event: PointerEvent) => {
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-safe-html-source-line]')
          : null;
        dom.dataset.safeHtmlCursorLine = target?.dataset.safeHtmlSourceLine ?? '0';
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos === 'number') {
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
        }
      };
      dom.addEventListener('pointerdown', rememberClickedLine);

      return {
        dom,
        destroy: () => dom.removeEventListener('pointerdown', rememberClickedLine),
      };
    };
  },
});
