import { describe, it, expect } from 'vitest';
import { withTableBorders } from '../../utils/table-copy';

describe('withTableBorders', () => {
  it('adds inline borders to copied tables, cells and header cells', () => {
    const out = withTableBorders('<p data-pm-slice="1 1 []">Intro</p><table class="editor-table"><tbody><tr><th>A</th></tr><tr><td style="text-align:right">1</td></tr></tbody></table>');
    const doc = new DOMParser().parseFromString(out, 'text/html');
    const table = doc.querySelector('table')!;
    expect(table.getAttribute('border')).toBe('1');
    expect(table.getAttribute('style')).toContain('border-collapse:collapse');
    expect(doc.querySelector('th')!.getAttribute('style')).toMatch(/border:1px solid .*font-weight:bold/);
    expect(doc.querySelector('td')!.getAttribute('style')).toMatch(/border:1px solid .*text-align:right/);
    expect(doc.querySelector('p')!.getAttribute('data-pm-slice')).toBe('1 1 []');
  });

  it('leaves HTML without tables untouched', () => {
    expect(withTableBorders('<p>Plain</p>')).toBe('<p>Plain</p>');
  });
});
