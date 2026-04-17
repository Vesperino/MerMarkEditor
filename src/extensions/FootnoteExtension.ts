import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import { Plugin } from '@tiptap/pm/state';
import FootnoteNode from '../components/FootnoteNode.vue';
import type { FootnoteDefinition } from '../utils/footnote-utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: () => ReturnType;
    };
  }
}

/**
 * Inline atom node for footnote references ([^label] in markdown).
 * Renders as a superscript number: <sup data-footnote-ref="label">N</sup>
 */
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-footnote-ref'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.label) return {};
          return { 'data-footnote-ref': attributes.label as string };
        },
      },
      index: {
        default: null,
        parseHTML: (element: HTMLElement) => element.textContent?.trim() || null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'sup[data-footnote-ref]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'sup',
      mergeAttributes(HTMLAttributes, { class: 'footnote-ref' }),
      node.attrs.index?.toString() || '?',
    ];
  },
});

/**
 * Block atom node for the footnotes section at the end of a document.
 * Stores definitions as a URL-encoded JSON attribute for lossless roundtrip.
 * Uses a Vue NodeView for interactive editing in the WYSIWYG editor.
 */
export const FootnoteSection = Node.create({
  name: 'footnoteSection',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      definitions: {
        default: '[]',
        parseHTML(element: HTMLElement) {
          const encoded = element.getAttribute('data-definitions');
          if (encoded) {
            try {
              const json = decodeURIComponent(encoded);
              JSON.parse(json);
              return json;
            } catch { /* fall through */ }
          }

          const items = element.querySelectorAll('li[data-footnote-id]');
          const defs: FootnoteDefinition[] = [];
          items.forEach(li => {
            const label = li.getAttribute('data-footnote-id') || '';
            const p = li.querySelector('p');
            const content = p ? (p.textContent || '') : (li.textContent || '');
            defs.push({ label, content: content.trim() });
          });
          return JSON.stringify(defs);
        },
        renderHTML(attributes: Record<string, unknown>) {
          return { 'data-definitions': encodeURIComponent(attributes.definitions as string) };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-footnotes]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const defs: FootnoteDefinition[] = JSON.parse(node.attrs.definitions || '[]');

    const listItems: unknown[] = defs.map(def =>
      ['li', { 'data-footnote-id': def.label }, ['p', {}, def.content]]
    );

    return [
      'section',
      mergeAttributes(HTMLAttributes, { class: 'footnotes', 'data-footnotes': '' }),
      ['hr'],
      ['ol', {}, ...listItems],
    ];
  },

  addStorage() {
    return {
      pendingPopoverLabel: null as string | null,
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(FootnoteNode as any);
  },

  // Auto-renumber FootnoteRef nodes by their document order after every edit.
  // Converges because the plugin returns null when all indexes already match order.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(tr => tr.docChanged)) return null;

          const tr = newState.tr;
          let changed = false;
          let n = 1;

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'footnoteRef') {
              if (node.attrs.index !== n) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, index: n });
                changed = true;
              }
              n++;
            }
          });

          return changed ? tr : null;
        },
      }),
    ];
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ editor, state, tr, dispatch }) => {
          // Refuse if cursor is inside the footnote section itself
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === 'footnoteSection') return false;
          }

          // Scan doc once for section + existing labels
          let sectionPos: number | null = null;
          let existingDefs: FootnoteDefinition[] = [];
          const usedLabels = new Set<string>();

          state.doc.descendants((node, pos) => {
            if (node.type.name === 'footnoteSection') {
              sectionPos = pos;
              try {
                existingDefs = JSON.parse(node.attrs.definitions || '[]');
              } catch { existingDefs = []; }
              existingDefs.forEach(d => usedLabels.add(d.label));
            } else if (node.type.name === 'footnoteRef' && node.attrs.label) {
              usedLabels.add(String(node.attrs.label));
            }
          });

          let nextNum = 1;
          while (usedLabels.has(String(nextNum))) nextNum++;
          const label = String(nextNum);
          const index = existingDefs.length + 1;

          if (!dispatch) return true;

          // Signal Editor.vue to open popover for this label
          (editor.storage as unknown as Record<string, { pendingPopoverLabel: string | null }>)
            .footnoteSection.pendingPopoverLabel = label;

          // Build nodes
          const refNode = editor.schema.nodes.footnoteRef.create({ label, index });
          const defsJson = JSON.stringify([...existingDefs, { label, content: '' }]);

          // Single transaction: insert ref at cursor, then update/create section
          // using tr.mapping.map() to keep section position valid after the insert.
          const { from, to } = state.selection;
          tr.replaceWith(from, to, refNode);

          if (sectionPos !== null) {
            const mapped = tr.mapping.map(sectionPos);
            tr.setNodeMarkup(mapped, undefined, { definitions: defsJson });
          } else {
            const sectionNode = editor.schema.nodes.footnoteSection.create({
              definitions: defsJson,
            });
            tr.insert(tr.doc.content.size, sectionNode);
          }

          dispatch(tr);
          return true;
        },
    };
  },
});
