import type { Editor } from '@tiptap/vue-3';
import type { EditorView } from '@codemirror/view';
import type { DocumentSearchMatch, VisualSearchMatch } from '../composables/useDocumentSearch';

/** Apply a replacement batch as one undoable editor transaction. */
export function replaceDocumentMatches(matches: (DocumentSearchMatch | VisualSearchMatch)[], text: string, code: EditorView | null, visual: Editor | null) {
  if (!matches.length) return;
  if (code) {
    code.dispatch({ changes: matches.map(m => ({ from: m.start, to: m.end, insert: text })) });
  } else if (visual) {
    const transaction = visual.state.tr;
    for (const match of [...matches].reverse()) {
      if ('from' in match) transaction.insertText(text, match.from, match.to);
    }
    visual.view.dispatch(transaction);
  }
}
