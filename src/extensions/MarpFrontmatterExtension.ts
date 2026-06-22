import { Node, mergeAttributes } from '@tiptap/core';

// Atom block node for a document's leading YAML front matter (Marp decks et al).
// Renders as a compact badge instead of dumping the raw `marp: true / theme: …`
// lines as editable paragraphs. The raw block is kept verbatim in an attribute
// so save/Present round-trips it back to `---\n…\n---` untouched.
export const MarpFrontmatterExtension = Node.create({
  name: 'marpFrontmatter',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      raw: { default: '' },
      isMarp: { default: true },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div.marp-frontmatter',
        getAttrs(node) {
          const el = node as HTMLElement;
          const enc = el.getAttribute('data-marp-frontmatter') || '';
          let raw = '';
          try { raw = decodeURIComponent(enc); } catch { raw = enc; }
          return { raw, isMarp: el.getAttribute('data-marp') !== 'false' };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const raw = (node.attrs.raw as string) || '';
    const isMarp = node.attrs.isMarp !== false;
    const themeMatch = raw.match(/(?:^|\n)\s*theme\s*:\s*([^\n]+)/i);
    const meta = themeMatch ? `theme: ${themeMatch[1].trim()}` : '';
    const children: unknown[] = [
      ['span', { class: 'mf-icon' }, '🎬'],
      ['span', { class: 'mf-title' }, isMarp ? 'Marp presentation' : 'Front matter'],
    ];
    if (meta) children.push(['span', { class: 'mf-meta' }, meta]);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        class: 'marp-frontmatter',
        'data-marp-frontmatter': encodeURIComponent(raw),
        'data-marp': String(isMarp),
        contenteditable: 'false',
      }),
      ...children,
    ] as unknown as [string, Record<string, unknown>, ...unknown[]];
  },
});
