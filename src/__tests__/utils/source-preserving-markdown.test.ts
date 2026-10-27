import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown-converter';
import { sourcePreservingMarkdown } from '../../utils/source-preserving-markdown';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { isAllowedMarkdownLink } from '../../utils/markdown-link';

const fixture = readFileSync('src/__tests__/fixtures/save-churn.md', 'utf8').replace(/\r\n?/g, '\n');

describe('sourcePreservingMarkdown', () => {
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
