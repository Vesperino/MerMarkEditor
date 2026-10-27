import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as converter from '../../utils/markdown-converter';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown-converter';
import { sourcePreservingMarkdown } from '../../utils/source-preserving-markdown';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { isAllowedMarkdownLink } from '../../utils/markdown-link';
import {
  BUILTIN_MERMAID_FORMATS, getCurrentMermaidReadFormats, getCurrentMermaidWriteFormat,
  setCurrentMermaidReadFormats, setCurrentMermaidWriteFormat,
} from '../../utils/mermaid-formats';

const fixture = readFileSync('src/__tests__/fixtures/save-churn.md', 'utf8').replace(/\r\n?/g, '\n');

describe('sourcePreservingMarkdown', () => {
  it('reuses validation as the next saved revision baseline', () => {
    const source = '# Cache revisions\n\nfirst\nwrapped\n';
    const html = markdownToHtml(source);
    const convert = vi.spyOn(converter, 'markdownToHtml');
    try {
      const first = sourcePreservingMarkdown(html.replace('Cache revisions', 'First revision'), source);
      expect(first).toBe(source.replace('Cache revisions', 'First revision'));
      expect(convert).toHaveBeenCalledTimes(2); // cold baseline + validation
      convert.mockClear();
      const next = sourcePreservingMarkdown(html.replace('Cache revisions', 'Next revision'), first);
      expect(next).toBe(source.replace('Cache revisions', 'Next revision'));
      expect(convert).toHaveBeenCalledTimes(1); // validation only
      convert.mockClear();
      expect(sourcePreservingMarkdown(html.replace('Cache revisions', 'Next revision'), next)).toBe(next);
      expect(convert).not.toHaveBeenCalled();
    } finally { convert.mockRestore(); }
  });

  it('evicts old revisions instead of retaining every opened document', () => {
    const documents = ['one', 'two', 'three'].map(id => `# Bounded cache ${id}\n\nwrapped\ntext\n`);
    for (const source of documents) sourcePreservingMarkdown(markdownToHtml(source), source);
    const html = markdownToHtml(documents[0]);
    const convert = vi.spyOn(converter, 'markdownToHtml');
    try {
      expect(sourcePreservingMarkdown(html, documents[0])).toBe(documents[0]);
      expect(convert).toHaveBeenCalledTimes(1);
    } finally { convert.mockRestore(); }
  });

  it('bounds retained text across two large revisions and rejects oversized entries', () => {
    const documents = ['first', 'second'].map(id => id + ' bounded '.repeat(80_000));
    for (const source of documents) sourcePreservingMarkdown(markdownToHtml(source), source);
    const html = markdownToHtml(documents[0]);
    const convert = vi.spyOn(converter, 'markdownToHtml');
    try {
      expect(sourcePreservingMarkdown(html, documents[0])).toBe(documents[0]);
      expect(convert).toHaveBeenCalledTimes(1); // total-size eviction, below the two-entry limit
      const oversized = 'oversized ' + 'bounded '.repeat(150_000);
      const oversizedHtml = markdownToHtml(oversized);
      convert.mockClear();
      expect(sourcePreservingMarkdown(oversizedHtml, oversized)).toBe(oversized);
      expect(sourcePreservingMarkdown(oversizedHtml, oversized)).toBe(oversized);
      expect(convert).toHaveBeenCalledTimes(2);
    } finally { convert.mockRestore(); }
  });

  it.each(['read', 'write'])('invalidates cached baselines when Mermaid %s settings change', (kind) => {
    const read = getCurrentMermaidReadFormats();
    const write = getCurrentMermaidWriteFormat();
    const source = '# Cache settings\n\n:::mermaid\ngraph TD\n  A --> B\n:::\n';
    try {
      setCurrentMermaidReadFormats([...BUILTIN_MERMAID_FORMATS]);
      setCurrentMermaidWriteFormat(BUILTIN_MERMAID_FORMATS[0]);
      const html = markdownToHtml(source);
      expect(sourcePreservingMarkdown(html, source)).toBe(source);
      if (kind === 'read') {
        setCurrentMermaidReadFormats([BUILTIN_MERMAID_FORMATS[0]]);
        // The old visual diagram is now an edit relative to the new parser.
        expect(sourcePreservingMarkdown(html, source)).not.toBe(source);
      } else {
        setCurrentMermaidWriteFormat(BUILTIN_MERMAID_FORMATS[2]);
        expect(sourcePreservingMarkdown(html, source)).toBe(source);
      }
    } finally {
      setCurrentMermaidReadFormats(read);
      setCurrentMermaidWriteFormat(write);
    }
  });

  it.each([0, 1, 15, 29])('retains the source spelling of repeated paragraph %i', (occurrence) => {
    const paragraphs: string[] = Array.from({ length: 30 }, (_, i) => i % 2 ? 'same paragraph\n\n' : 'same\nparagraph\n\n');
    const source = paragraphs.join('');
    const html = '<p>same paragraph</p>'.repeat(occurrence)
      + '<p>same Xparagraph</p>' + '<p>same paragraph</p>'.repeat(29 - occurrence);
    const expected = [...paragraphs];
    expected[occurrence] = expected[occurrence].replace('paragraph', 'Xparagraph');
    expect(sourcePreservingMarkdown(html, source)).toBe(expected.join(''));
  });

  it.each(['bold', 'strong'])('keeps HTML tag names separate from visible text anchors (%s)', (word) => {
    const source = `first\nwrapped\n\nBefore <strong>${word}</strong> text\n\nlast\nwrapped\n`;
    const html = markdownToHtml(source).replace(`>${word}<`, `>${word.slice(0, 2)}X${word.slice(2)}<`);
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace(`>${word}<`, `>${word.slice(0, 2)}X${word.slice(2)}<`));
  });

  it.each([
    'before `<widget>literal</widget>` after\n',
    '```html\n<strong>literal</strong>\n<!-- literal comment -->\n```\n',
    '```txt\n!!! []() <> -- ** __\n```\n',
  ])('preserves literal syntax inside code while editing it (%#)', (block) => {
    const source = 'neighbor\nwrapped\n\n' + block + '\nuntouched\nsource\n';
    const before = block.includes('literal') ? 'literal' : '!!!';
    const html = markdownToHtml(source).replace(before, before + 'X');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace(before, before + 'X'));
  });

  it('preserves localized deletion, replacement and separated edits in a repeated document', () => {
    const source = 'first\nwrapped\n\n'.repeat(50) + 'a unique target\n\n' + 'last\nwrapped\n\n'.repeat(50);
    const html = markdownToHtml(source).replace('a unique target', 'replacement').replace('first wrapped', 'first');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('a unique target', 'replacement').replace('first\nwrapped', 'first'));
  });
  it.each(['', '\n', '\n\n', '\r\n', '\r\n\r\n'])('preserves the EOF suffix %j when appending text or a paragraph', (suffix) => {
    const source = 'last' + suffix;
    expect(sourcePreservingMarkdown('<p>lastX</p>', source)).toBe('lastX' + suffix);
    const ending = suffix.includes('\r') ? '\r\n' : '\n';
    expect(sourcePreservingMarkdown('<p>last</p><p>new</p>', source)).toBe('last' + ending + ending + 'new' + suffix);
  });

  it.each(['\n', '\r\n'])('preserves trailing blank lines when editing the final fenced block (%j)', (ending) => {
    const source = '```js\nconst value = 1;\n```\n\n'.replace(/\n/g, ending);
    const html = markdownToHtml(source).replace('value = 1', 'value = 2');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('value = 1', 'value = 2'));
  });
  it.each([undefined, null])('serializes a new document without a source baseline (%s)', (source) => {
    expect(sourcePreservingMarkdown('<h2>New</h2><p><strong>text</strong></p>', source)).toBe('## New\n**text**');
  });

  it('supports an explicitly empty source and deleting the entire document', () => {
    expect(sourcePreservingMarkdown('<p>New text</p>', '')).toBe('New text');
    expect(sourcePreservingMarkdown('<p></p>', '# Title\n\nText\n')).toBe('');
    expect(sourcePreservingMarkdown('<p></p>', '')).toBe('');
  });

  it('preserves an already empty document with existing blank lines', () => {
    expect(sourcePreservingMarkdown('<p></p>', '\n\n  \n')).toBe('\n\n  \n');
  });

  it('preserves the synthetic document byte-for-byte without an edit', () => {
    expect(sourcePreservingMarkdown(markdownToHtml(fixture), fixture)).toBe(fixture);
  });

  it.each(['Sample handbook', 'Write short notes.', 'A record can span several source lines.', 'reference index'])('changes only the inserted character in %s', (text) => {
    const html = markdownToHtml(fixture).replace(text, text + 'X');
    expect(sourcePreservingMarkdown(html, fixture)).toBe(fixture.replace(text, text + 'X'));
  });

  it('round-trips a real visual editor transaction against the synthetic document', () => {
    const editor = new Editor({ extensions: [StarterKit.configure({ link: false }), Link.extend({ name: 'customLink' }).configure({ isAllowedUri: isAllowedMarkdownLink })], content: markdownToHtml(fixture) });
    try {
      editor.commands.insertContentAt(1, 'X');
      expect(sourcePreservingMarkdown(editor.getHTML(), fixture)).toBe(fixture.replace('# Sample', '# XSample'));
    } finally { editor.destroy(); }
  });

  // Each offset represents a real visible caret position, including both sides
  // of the soft line break. Assert the exact source, not only rendered equality.
  it.each(Array.from({ length: 'alpha beta gamma'.length + 1 }, (_, offset) => offset))('inserts at visible offset %i without changing paragraph wrapping', (offset) => {
    const paragraph = 'alpha\nbeta gamma';
    const source = `${paragraph}\n\nsecond\nparagraph\n`;
    const visible = paragraph.replace('\n', ' ');
    const html = markdownToHtml(source).replace(visible, visible.slice(0, offset) + 'X' + visible.slice(offset));
    expect(sourcePreservingMarkdown(html, source)).toBe(source.slice(0, offset) + 'X' + source.slice(offset));
  });

  it.each([
    ['beta ', '', 'deletion'],
    ['beta', 'replacement', 'replacement'],
    ['beta', '🌱 café e\u0301', 'Unicode replacement'],
  ])('preserves wrapping on %s → %s (%s)', (before, after) => {
    const source = 'alpha\nbeta gamma\n\nunchanged\nparagraph\n';
    const html = markdownToHtml(source).replace(before, after);
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace(before, after));
  });

  it('edits the correct occurrence of repeated paragraphs', () => {
    const source = 'same\nparagraph\n\nsame\nparagraph\n\nsame\nparagraph\n';
    const html = '<p>same paragraph</p><p>same Xparagraph</p><p>same paragraph</p>';
    expect(sourcePreservingMarkdown(html, source)).toBe('same\nparagraph\n\nsame\nXparagraph\n\nsame\nparagraph\n');
  });

  it('inserts before collapsed spaces without moving them into the word', () => {
    const source = 'alpha   beta\n\nlast\nwrapped\n';
    expect(sourcePreservingMarkdown('<p>alphaX beta</p><p>last wrapped</p>', source)).toBe(source.replace('alpha', 'alphaX'));
  });

  it.each(['  \n', '\\\n'])('keeps the original hard-break marker %j', (marker) => {
    const source = `first${marker}second\n\nlast\nwrapped\n`;
    const html = markdownToHtml(source).replace('second', 'secondX');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('second', 'secondX'));
  });

  it('returns the original source after a visual edit is undone', () => {
    const source = 'first\nwrapped\n\n__bold__ text\n\n';
    const originalHtml = markdownToHtml(source);
    expect(sourcePreservingMarkdown(originalHtml.replace('bold', 'changed'), source)).not.toBe(source);
    expect(sourcePreservingMarkdown(originalHtml, source)).toBe(source);
  });

  it('preserves code-block whitespace when editing its contents', () => {
    const source = 'first\nwrapped\n\n```js\n  const x = 1;\n\n\n  return x;\n```\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('const x = 1;', 'const x = 2;');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('const x = 1;', 'const x = 2;'));
  });

  it('changes a relative link destination without rewriting surrounding text', () => {
    const source = 'first\nwrapped [guide](../docs/guide.md#start)\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('../docs/guide.md#start', '../docs/new.md#start');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('../docs/guide.md#start', '../docs/new.md#start'));
  });

  it('changes heading level while preserving its surrounding blank lines', () => {
    const source = '# Heading\n\n\nfirst\nwrapped\n';
    const html = markdownToHtml(source).replace('<h1 ', '<h2 ').replace('</h1>', '</h2>');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('# Heading', '## Heading'));
  });

  it('inserts a new paragraph without rewrapping existing paragraphs', () => {
    const source = 'first\nwrapped\n\nlast\nwrapped\n';
    const html = '<p>first wrapped</p><p>new paragraph</p><p>last wrapped</p>';
    expect(sourcePreservingMarkdown(html, source)).toBe('first\nwrapped\n\nnew paragraph\n\nlast\nwrapped\n');
  });

  it('edits a table cell while preserving alignment markers and column spacing', () => {
    const source = 'first\nwrapped\n\n| Name    | Value |\n| :------ | ----: |\n| Alpha   | 1     |\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('Alpha', 'AlphaX');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('Alpha', 'AlphaX'));
  });

  it('toggles a task without changing nested task indentation', () => {
    const source = '- [ ] parent\n  - [x] child\n\nlast\nwrapped\n';
    const original = markdownToHtml(source);
    const html = original.replace('data-checked="false"', 'data-checked="true"');
    expect(html).not.toBe(original);
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('- [ ] parent', '- [x] parent'));
  });

  it.each(['\n', '\r\n', '\r'])('preserves %j line endings and trailing whitespace', (ending) => {
    const source = 'first line\nwrapped text\n\n\n* item\n\n  \n'.replace(/\n/g, ending);
    const html = markdownToHtml(source).replace('wrapped text', 'wrapped Xtext');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('wrapped text', 'wrapped Xtext'));
  });

  it('retains literal underscore syntax and alternate list markers on text edits', () => {
    const source = '* __bold__ text\n* second\n\n---\n\nlast\n';
    const html = markdownToHtml(source).replace('bold', 'bXold');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('bold', 'bXold'));
  });

  it('keeps reference definitions and comments when editing elsewhere', () => {
    const source = '# Heading\n\n[reference][id]\n\n[id]: https://example.com "Title"\n\n<!-- keep me -->\n';
    const html = markdownToHtml(source).replace('Heading', 'HeadingX');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('Heading', 'HeadingX'));
  });

  it.each([
    '---\nmarp: true\ntheme: gaia\n---\n\n# Heading\n\n<!-- _class: lead -->\n',
    '# Heading\n\n~~~js\nconst value = 1;\n\n\n~~~\n',
    '# Heading\n\n```mermaid\ngraph TD\n  A --> B\n```\n',
    '# Heading\n\n| Name | Value |\n| :--- | ---: |\n| A | 1 |\n',
    '# Heading\n\nText[^note]\n\n[^note]: keep this definition\n',
    '# Heading\n\n<p align="center"><strong>raw HTML</strong></p>\n',
    '# Heading\n\nInline $a_b$ and display:\n\n$$\nx^2\n$$\n',
  ])('preserves unrelated special syntax while editing a heading (%#)', (source) => {
    const html = markdownToHtml(source).replace('>Heading<', '>HeadingX<');
    expect(sourcePreservingMarkdown(html, source)).toBe(source.replace('# Heading', '# HeadingX'));
  });

  it('keeps unrelated wrapping when changing formatting', () => {
    const source = 'first\nwrapped\n\nplain text\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('plain text', '<strong>plain text</strong>');
    const result = sourcePreservingMarkdown(html, source);
    expect(result).toBe(source.replace('plain text', '**plain text**'));
  });

  it('preserves unrelated source when removing inline HTML emphasis', () => {
    const source = 'first\nwrapped\n\nBefore <strong>bold</strong> text\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('<strong>bold</strong>', 'bold');
    expect(html).not.toBe(markdownToHtml(source));
    const result = sourcePreservingMarkdown(html, source);
    expect(result).toBe(source.replace('<strong>bold</strong>', 'bold'));
  });

  it('applies multiple edits and does not resurrect deleted content', () => {
    const source = '# Title\n\nfirst\nwrapped\n\nremove me\n\nlast\nwrapped\n';
    const html = markdownToHtml(source).replace('Title', 'New title').replace('<p>remove me</p>', '').replace('last wrapped', 'last Xwrapped');
    const result = sourcePreservingMarkdown(html, source);
    expect(result).toContain('first\nwrapped');
    expect(result).not.toContain('remove me');
    expect(htmlToMarkdown(markdownToHtml(result))).toBe(htmlToMarkdown(html));
  });
});
