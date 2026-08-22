import { Node, mergeAttributes } from '@tiptap/core';
import { decodeSafeHtmlSource, encodeSafeHtmlSource, sanitizeSafeHtml } from '../utils/safe-html';

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
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'safe-html-block';
      dom.contentEditable = 'false';
      dom.innerHTML = sanitizeSafeHtml(String(node.attrs.raw ?? ''));
      return { dom };
    };
  },
});
