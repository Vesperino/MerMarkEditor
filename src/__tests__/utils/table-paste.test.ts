import { describe, it, expect } from 'vitest';
import { isTableOnlyHtml, isTableOnlyText } from '../../utils/table-paste';

const table = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';

describe('isTableOnlyHtml', () => {
  it('accepts a lone table, including spreadsheet head styles', () => {
    expect(isTableOnlyHtml(table)).toBe(true);
    expect(isTableOnlyHtml(`<html><head><style>td{color:red}</style></head><body><meta charset="utf-8">${table}</body></html>`)).toBe(true);
  });

  it('rejects a chat answer with prose or code around the table', () => {
    expect(isTableOnlyHtml(`<p>Intro</p>${table}<p>Outro</p>`)).toBe(false);
    expect(isTableOnlyHtml(`<pre><code>--codec hevc</code></pre>${table}`)).toBe(false);
  });

  it('rejects multiple tables and HTML without a table', () => {
    expect(isTableOnlyHtml(table + table)).toBe(false);
    expect(isTableOnlyHtml('<p>No table</p>')).toBe(false);
  });
});

describe('isTableOnlyText', () => {
  it('accepts tab-separated and pipe tables', () => {
    expect(isTableOnlyText('A\tB\n1\t2\n')).toBe(true);
    expect(isTableOnlyText('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(true);
  });

  it('rejects prose that contains a table', () => {
    expect(isTableOnlyText('Intro paragraph.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAbout 2 GB per hour.')).toBe(false);
    expect(isTableOnlyText('Intro paragraph.\n\tA\tB\n1080p\t1500\t4500')).toBe(false);
  });

  it('rejects a single line and text with a stray pipe', () => {
    expect(isTableOnlyText('A\tB')).toBe(false);
    expect(isTableOnlyText('use a | b\nplain line')).toBe(false);
  });
});
