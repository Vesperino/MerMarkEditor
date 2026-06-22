import { Node, mergeAttributes } from '@tiptap/core';

// Atom block node for a standalone Marp directive comment, e.g.
// `<!-- _class: lead -->`. Shown as a small chip instead of raw comment text;
// the directive is kept verbatim and round-trips back to the HTML comment.
export const MarpDirectiveExtension = Node.create({
  name: 'marpDirective',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.marp-directive',
        getAttrs(node) {
          const el = node as HTMLElement;
          const enc = el.getAttribute('data-marp-directive') || '';
          let raw = '';
          try { raw = decodeURIComponent(enc); } catch { raw = enc; }
          return { raw };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = (node.attrs.raw as string) || '';
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'marp-directive',
        'data-marp-directive': encodeURIComponent(raw),
        contenteditable: 'false',
      }),
      ['span', { class: 'md-icon' }, '⚙'],
      ['span', { class: 'md-text' }, raw],
    ];
  },
});
