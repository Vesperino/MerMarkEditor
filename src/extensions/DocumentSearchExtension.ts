import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface DocumentSearchDecoration {
  from: number;
  to: number;
}

interface SearchPluginState {
  matches: DocumentSearchDecoration[];
  activeIndex: number;
}

const documentSearchKey = new PluginKey<SearchPluginState>('documentSearch');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentSearch: {
      setDocumentSearchResults: (matches: DocumentSearchDecoration[], activeIndex: number) => ReturnType;
      clearDocumentSearchResults: () => ReturnType;
    };
  }
}

export const DocumentSearchExtension = Extension.create({
  name: 'documentSearch',

  addCommands() {
    return {
      setDocumentSearchResults:
        (matches: DocumentSearchDecoration[], activeIndex: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(documentSearchKey, { matches, activeIndex });
            dispatch(tr);
          }
          return true;
        },
      clearDocumentSearchResults:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(documentSearchKey, { matches: [], activeIndex: -1 });
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchPluginState>({
        key: documentSearchKey,
        state: {
          init: () => ({ matches: [], activeIndex: -1 }),
          apply: (tr, value) => {
            const meta = tr.getMeta(documentSearchKey) as SearchPluginState | undefined;
            if (meta) return meta;
            if (tr.docChanged && value.matches.length > 0) {
              return { matches: [], activeIndex: -1 };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = documentSearchKey.getState(state);
            if (!pluginState || pluginState.matches.length === 0) {
              return DecorationSet.empty;
            }

            const decorations = pluginState.matches
              .filter((match) => match.from < match.to)
              .map((match, index) => Decoration.inline(match.from, match.to, {
                class: index === pluginState.activeIndex
                  ? 'doc-search-hit doc-search-hit--active'
                  : 'doc-search-hit',
              }));

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
