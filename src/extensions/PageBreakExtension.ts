import { Node, mergeAttributes } from '@tiptap/core';

export const PageBreakExtension = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,

  parseHTML() {
    return [
      {
        tag: 'div.page-break',
      },
      {
        tag: 'div[style]',
        getAttrs(node) {
          const el = node as HTMLElement;
          const style = el.getAttribute('style') || '';
          if (/page-break-after\s*:\s*always/i.test(style)) {
            return {};
          }
          return false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'page-break' })];
  },
});
