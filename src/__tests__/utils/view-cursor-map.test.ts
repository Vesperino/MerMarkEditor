import { describe, expect, it } from 'vitest';
import { alignKinds, listItemLines, listMarkerLength, sourceEntries, tableCells, type SourceBlock } from '../../utils/view-cursor-map';
import { mapMarkdownCursor } from '../../utils/markdown-cursor';

describe('alignKinds', () => {
  it('keeps later blocks paired when the editor holds extra blocks', () => {
    const source = ['heading1', 'paragraph', 'heading2', 'list'];
    const visual = ['heading1', 'image', 'katexBlock', 'paragraph', 'heading2', 'list'];
    const { toVisual, toSource } = alignKinds(source, visual);
    expect(toVisual).toEqual([0, 3, 4, 5]);
    expect(toSource).toEqual([0, 0, 0, 1, 2, 3]);
  });

  it('pairs blocks whose kinds differ on both sides in order', () => {
    const { toVisual, toSource } = alignKinds(['heading1', 'paragraph', 'table'], ['heading1', 'katexBlock', 'table']);
    expect(toVisual).toEqual([0, 1, 2]);
    expect(toSource).toEqual([0, 1, 2]);
  });

  it('resolves leading blocks that have no counterpart to the first pair', () => {
    expect(alignKinds(['hr', 'paragraph'], ['paragraph']).toVisual).toEqual([0, 0]);
  });
});

describe('sourceEntries', () => {
  const entries = (lines: string[], blocks: SourceBlock[]) => sourceEntries(blocks, lines)
    .map(entry => `${entry.block}:${entry.kind}:${lines.slice(blocks[entry.block].startLine, blocks[entry.block].endLine).join('\n').slice(entry.from, entry.to)}`);

  it('splits a paragraph around its inline images', () => {
    const lines = ['intro ![a](a.png) outro', '![solo](b.png)'];
    const blocks: SourceBlock[] = [
      { startLine: 0, endLine: 1, type: 'paragraph' },
      { startLine: 1, endLine: 2, type: 'paragraph' },
    ];
    expect(entries(lines, blocks)).toEqual([
      '0:paragraph:intro ', '0:image:![a](a.png)', '0:paragraph: outro', '1:image:![solo](b.png)',
    ]);
  });

  it('tags headings with their level', () => {
    expect(entries(['### Deep'], [{ startLine: 0, endLine: 1, type: 'heading' }])).toEqual(['0:heading3:### Deep']);
  });
});

describe('list and table helpers', () => {
  it('measures list markers including indent and checkbox', () => {
    expect(listMarkerLength('  - [x] done')).toBe(8);
    expect(listMarkerLength('12. item')).toBe(4);
    expect(listMarkerLength('continued text')).toBe(-1);
  });

  it('lists item lines in document order and skips continuation lines', () => {
    const lines = ['- one', '  wrapped', '  - nested', '- two'];
    expect(listItemLines(lines, { startLine: 0, endLine: 4, type: 'list' })).toEqual([0, 2, 3]);
  });

  it('finds trimmed cell ranges and ignores escaped pipes', () => {
    const line = '| first | a \\| b |  |';
    expect(tableCells(line).map(cell => line.slice(cell.from, cell.to))).toEqual(['first', 'a \\| b', '']);
    const bare = 'x | y';
    expect(tableCells(bare).map(cell => bare.slice(cell.from, cell.to))).toEqual(['x', 'y']);
  });
});

describe('mapMarkdownCursor bias', () => {
  it('puts a selection start after the opening marker and a caret before it', () => {
    const visible = 'bold and italic here';
    const raw = '**bold** and *italic* here';
    expect(mapMarkdownCursor(visible, raw, 9, 'after')).toBe(raw.indexOf('italic'));
    expect(mapMarkdownCursor(visible, raw, 9)).toBe(raw.indexOf('*italic'));
  });
});
