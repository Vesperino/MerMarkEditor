import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { buildMoveBlockTransaction } from '../../extensions/move-block/moveBlock';

const createdEditors: Editor[] = [];

function makeEditor(content: string): Editor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit],
    content,
  });
  createdEditors.push(editor);
  return editor;
}

function fireShortcut(editor: Editor, direction: 'up' | 'down'): boolean {
  const tr = buildMoveBlockTransaction(editor.state, direction);
  if (!tr) return false;
  editor.view.dispatch(tr);
  return true;
}

afterEach(() => {
  while (createdEditors.length) createdEditors.pop()!.destroy();
});

describe('MoveBlockExtension — paragraphs', () => {
  it('moves the current paragraph up', () => {
    const editor = makeEditor('<p>aaa</p><p>bbb</p><p>ccc</p>');
    editor.commands.setTextSelection(7); // inside "bbb"
    expect(fireShortcut(editor, 'up')).toBe(true);
    expect(editor.getHTML()).toBe('<p>bbb</p><p>aaa</p><p>ccc</p>');
  });

  it('moves the current paragraph down', () => {
    const editor = makeEditor('<p>aaa</p><p>bbb</p><p>ccc</p>');
    editor.commands.setTextSelection(2); // inside "aaa"
    expect(fireShortcut(editor, 'down')).toBe(true);
    expect(editor.getHTML()).toBe('<p>bbb</p><p>aaa</p><p>ccc</p>');
  });

  it('is a no-op when moving the first block up', () => {
    const editor = makeEditor('<p>aaa</p><p>bbb</p>');
    editor.commands.setTextSelection(2);
    expect(fireShortcut(editor, 'up')).toBe(false);
    expect(editor.getHTML()).toBe('<p>aaa</p><p>bbb</p>');
  });

  it('is a no-op when moving the last block down', () => {
    const editor = makeEditor('<p>aaa</p><p>bbb</p>');
    editor.commands.setTextSelection(7);
    expect(fireShortcut(editor, 'down')).toBe(false);
    expect(editor.getHTML()).toBe('<p>aaa</p><p>bbb</p>');
  });

  it('moves a multi-block selection together', () => {
    const editor = makeEditor('<p>aaa</p><p>bbb</p><p>ccc</p><p>ddd</p>');
    // Select from "bbb" into "ccc"
    editor.commands.setTextSelection({ from: 7, to: 12 });
    expect(fireShortcut(editor, 'up')).toBe(true);
    expect(editor.getHTML()).toBe('<p>bbb</p><p>ccc</p><p>aaa</p><p>ddd</p>');
  });
});

describe('MoveBlockExtension — mixed block types', () => {
  it('moves a heading past a paragraph', () => {
    const editor = makeEditor('<p>intro</p><h2>Title</h2><p>after</p>');
    editor.commands.setTextSelection(10); // inside heading
    expect(fireShortcut(editor, 'up')).toBe(true);
    expect(editor.getHTML()).toBe('<h2>Title</h2><p>intro</p><p>after</p>');
  });

  it('moves a code block down past a paragraph', () => {
    const editor = makeEditor('<pre><code>x</code></pre><p>after</p>');
    editor.commands.setTextSelection(2); // inside code
    expect(fireShortcut(editor, 'down')).toBe(true);
    // Tiptap may emit a trailing empty paragraph; normalise before comparing.
    const html = editor.getHTML().replace(/<p><\/p>$/, '');
    expect(html).toBe('<p>after</p><pre><code>x</code></pre>');
  });
});

describe('MoveBlockExtension — list items', () => {
  it('reorders list items at the same level', () => {
    const editor = makeEditor('<ul><li><p>first</p></li><li><p>second</p></li><li><p>third</p></li></ul>');
    // Position inside "second"
    editor.commands.setTextSelection(12);
    expect(fireShortcut(editor, 'up')).toBe(true);
    const html = editor.getHTML().replace(/<p><\/p>$/, '');
    expect(html).toBe(
      '<ul><li><p>second</p></li><li><p>first</p></li><li><p>third</p></li></ul>'
    );
  });
});
