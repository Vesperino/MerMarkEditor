import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, toggleBlockComment } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { formatSource, selectNextOccurrence } from '../../utils/source-commands';
import { sourceHeadings } from '../../utils/source-headings';
import { replaceDocumentMatches } from '../../utils/document-replace';
import { findLiteralMatches } from '../../composables/useDocumentSearch';

function code(doc: string, from = 0, to = from) {
  return new EditorView({ state: EditorState.create({ doc, selection: { anchor: from, head: to }, extensions: [history(), markdown(), EditorState.allowMultipleSelections.of(true)] }) });
}
describe('Source editing commands', () => {
  it('toggles formatting with a selected word and leaves selection inside markers', () => {
    const view = code('hello world', 0, 5);
    try {
      formatSource(view, 'bold'); expect(view.state.doc.toString()).toBe('**hello** world');
      expect(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)).toBe('hello');
      formatSource(view, 'bold'); expect(view.state.doc.toString()).toBe('hello world');
      formatSource(view, 'italic'); expect(view.state.doc.toString()).toBe('*hello* world');
      formatSource(view, 'italic'); expect(view.state.doc.toString()).toBe('hello world');
      formatSource(view, 'link', 'https://example.com'); expect(view.state.doc.toString()).toBe('[hello](https://example.com) world');
    } finally { view.destroy(); }
  });
  it('sets headings across selected lines without duplicating markers and supports undo', () => {
    const view = code('# first\nsecond\nthird', 0, 15);
    try {
      formatSource(view, 3); expect(view.state.doc.toString()).toBe('### first\n### second\nthird');
      formatSource(view, 3); expect(view.state.doc.toString()).toBe('### first\n### second\nthird');
      undo(view); expect(view.state.doc.toString()).toBe('# first\nsecond\nthird');
    } finally { view.destroy(); }
  });
  it('selects the word, adds subsequent occurrences, wraps, and edits all selected matches', () => {
    const view = code('one two one one', 9);
    try {
      selectNextOccurrence(view); expect(view.state.selection.main.from).toBe(8);
      selectNextOccurrence(view); selectNextOccurrence(view);
      expect(view.state.selection.ranges.map(r => r.from)).toEqual([0, 8, 12]);
      expect(selectNextOccurrence(view)).toBe(false);
      view.dispatch(view.state.replaceSelection('ONE'));
      expect(view.state.doc.toString()).toBe('ONE two ONE ONE');
    } finally { view.destroy(); }
  });
  it('uses HTML comments in Markdown and toggles them back', () => {
    const view = code('hello', 0, 5);
    try {
      expect(toggleBlockComment(view)).toBe(true);
      expect(view.state.doc.toString()).toContain('<!--');
      toggleBlockComment(view); expect(view.state.doc.toString()).toBe('hello');
    } finally { view.destroy(); }
  });
  it('finds real Markdown headings, including Setext and excluding fenced code', () => {
    const headings = sourceHeadings('# title\n\n```md\n# fake\n```\n\nSubheading\n---\n');
    expect(headings.map(h => [h.level, h.label])).toEqual([[1, 'title'], [2, 'Subheading']]);
  });
});

describe('document replacements', () => {
  it('replaces every source match in one undo step, using literal replacement text', () => {
    const view = code('one two ONE');
    try {
      replaceDocumentMatches(findLiteralMatches(view.state.doc.toString(), 'one'), '$1', view, null);
      expect(view.state.doc.toString()).toBe('$1 two $1');
      undo(view); expect(view.state.doc.toString()).toBe('one two ONE');
    } finally { view.destroy(); }
  });
  it('replaces visual matches without losing surrounding marks, then undoes the batch', () => {
    const visual = new Editor({ extensions: [StarterKit], content: '<p><strong>one</strong> two one</p>' });
    try {
      const matches = findLiteralMatches('one two one', 'one').map(m => ({ ...m, from: m.start + 1, to: m.end + 1 }));
      replaceDocumentMatches(matches, 'many', null, visual);
      expect(visual.getHTML()).toContain('<strong>many</strong> two many');
      visual.commands.undo(); expect(visual.getHTML()).toContain('<strong>one</strong> two one');
    } finally { visual.destroy(); }
  });
});
