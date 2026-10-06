import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

export function formatSource(view: EditorView, format: 'bold' | 'italic' | 'link' | number, url = '') {
  const { state } = view;
  if (typeof format === 'number') {
    const lines = new Set<number>();
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number;
      const last = state.doc.lineAt(range.to > range.from ? range.to - 1 : range.to).number;
      for (let n = first; n <= last; n++) lines.add(n);
    }
    const changes = [...lines].sort((a, b) => a - b).map(n => {
      const line = state.doc.line(n);
      const prefix = line.text.match(/^ {0,3}#{1,6}(?:\s+|$)/)?.[0] ?? '';
      return { from: line.from, to: line.from + prefix.length, insert: format ? `${'#'.repeat(format)} ` : '' };
    });
    view.dispatch({ changes, scrollIntoView: true });
  } else {
    const marker = format === 'bold' ? '**' : '*';
    view.dispatch(state.changeByRange(range => {
      const text = state.sliceDoc(range.from, range.to);
      if (format === 'link') {
        const label = text || 'link';
        return { changes: { from: range.from, to: range.to, insert: `[${label}](${url})` },
          range: EditorSelection.range(range.from + 1, range.from + 1 + label.length) };
      }
      const wrapped = text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2;
      const around = state.sliceDoc(Math.max(0, range.from - marker.length), range.from) === marker &&
        state.sliceDoc(range.to, range.to + marker.length) === marker;
      const from = around ? range.from - marker.length : range.from;
      const to = around ? range.to + marker.length : range.to;
      const inner = wrapped ? text.slice(marker.length, -marker.length) : text;
      const insert = wrapped || around ? inner : marker + inner + marker;
      const start = from + (wrapped || around ? 0 : marker.length);
      return { changes: { from, to, insert }, range: EditorSelection.range(start, start + inner.length) };
    }));
  }
  view.focus();
}

/** Select the word first, then add the next non-overlapping occurrence, wrapping once. */
export function selectNextOccurrence(view: EditorView): boolean {
  const { state } = view;
  const main = state.selection.main;
  if (main.empty) {
    const word = state.wordAt(main.head);
    if (!word) return false;
    view.dispatch({ selection: word });
    return true;
  }
  const needle = state.sliceDoc(main.from, main.to);
  const text = state.doc.toString();
  const candidates = [text.slice(main.to), text.slice(0, main.from)];
  for (let part = 0; part < candidates.length; part++) {
    let offset = 0;
    while (offset <= candidates[part].length - needle.length) {
      const hit = candidates[part].indexOf(needle, offset);
      if (hit < 0) break;
      const from = hit + (part === 0 ? main.to : 0), to = from + needle.length;
      if (!state.selection.ranges.some(range => from < range.to && to > range.from)) {
        const ranges = [...state.selection.ranges, EditorSelection.range(from, to)];
        view.dispatch({ selection: EditorSelection.create(ranges, ranges.length - 1), scrollIntoView: true });
        return true;
      }
      offset = hit + needle.length;
    }
  }
  return false;
}
