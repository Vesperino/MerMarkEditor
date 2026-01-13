import { describe, it, expect } from 'vitest';

// Test helper functions from Editor.vue
// These are extracted/duplicated for testing since they're defined inside the component

function parseHtmlTable(html: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const table = doc.querySelector('table');
  if (!table) return null;

  const rows = table.querySelectorAll('tr');
  if (rows.length === 0) return null;

  let headerRow = '';
  let bodyRows = '';

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('th, td');
    if (cells.length === 0) return;

    let rowHtml = '<tr>';
    cells.forEach((cell) => {
      const text = cell.textContent?.trim() || '\u00A0';
      if (rowIndex === 0) {
        rowHtml += `<th><p>${text}</p></th>`;
      } else {
        rowHtml += `<td><p>${text}</p></td>`;
      }
    });
    rowHtml += '</tr>';

    if (rowIndex === 0) {
      headerRow = rowHtml;
    } else {
      bodyRows += rowHtml;
    }
  });

  let result = '<table>';
  if (headerRow) {
    result += `<thead>${headerRow}</thead>`;
  }
  result += `<tbody>${bodyRows || headerRow}</tbody>`;
  result += '</table>';

  return result;
}

function parseTextTable(text: string): string | null {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return null;

  const hasTabsOrPipes = lines.some((line) => line.includes('\t') || line.includes('|'));
  if (!hasTabsOrPipes) return null;

  const dataRows: string[][] = [];

  lines.forEach((line) => {
    if (/^\|?[\s\-:|]+\|?$/.test(line)) return;

    let cells: string[];
    if (line.includes('|')) {
      cells = line.split('|').map((c) => c.trim()).filter((c) => c);
    } else {
      cells = line.split('\t').map((c) => c.trim());
    }

    if (cells.length > 0) {
      dataRows.push(cells);
    }
  });

  if (dataRows.length === 0) return null;

  let result = '<table>';

  result += '<thead><tr>';
  dataRows[0].forEach((cell) => {
    result += `<th><p>${cell || '\u00A0'}</p></th>`;
  });
  result += '</tr></thead>';

  result += '<tbody>';
  for (let i = 1; i < dataRows.length; i++) {
    result += '<tr>';
    dataRows[i].forEach((cell) => {
      result += `<td><p>${cell || '\u00A0'}</p></td>`;
    });
    result += '</tr>';
  }
  if (dataRows.length === 1) {
    result += '<tr>';
    dataRows[0].forEach((cell) => {
      result += `<td><p>${cell || '\u00A0'}</p></td>`;
    });
    result += '</tr>';
  }
  result += '</tbody></table>';

  return result;
}

describe('Editor Helper Functions', () => {
  describe('parseHtmlTable', () => {
    it('returns null for non-table HTML', () => {
      expect(parseHtmlTable('<p>Not a table</p>')).toBeNull();
    });

    it('returns null for empty table', () => {
      expect(parseHtmlTable('<table></table>')).toBeNull();
    });

    it('parses simple HTML table', () => {
      const html = `
        <table>
          <tr><th>Header 1</th><th>Header 2</th></tr>
          <tr><td>Cell 1</td><td>Cell 2</td></tr>
        </table>
      `;
      const result = parseHtmlTable(html);

      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<th><p>Header 1</p></th>');
      expect(result).toContain('<td><p>Cell 1</p></td>');
    });

    it('handles table with only header row', () => {
      const html = `
        <table>
          <tr><th>Only</th><th>Header</th></tr>
        </table>
      `;
      const result = parseHtmlTable(html);

      expect(result).toContain('<thead>');
      expect(result).toContain('<tbody>');
      // Header should be duplicated as body when no body rows
      expect(result).toContain('<th><p>Only</p></th>');
    });

    it('handles empty cells', () => {
      const html = `
        <table>
          <tr><th>Header</th><th></th></tr>
          <tr><td></td><td>Value</td></tr>
        </table>
      `;
      const result = parseHtmlTable(html);

      // Empty cells should get non-breaking space
      expect(result).toContain('\u00A0');
    });

    it('preserves cell content with whitespace', () => {
      const html = `
        <table>
          <tr><th>  Spaced  </th></tr>
          <tr><td>  Content  </td></tr>
        </table>
      `;
      const result = parseHtmlTable(html);

      expect(result).toContain('<th><p>Spaced</p></th>');
      expect(result).toContain('<td><p>Content</p></td>');
    });

    it('handles multiple rows', () => {
      const html = `
        <table>
          <tr><th>A</th><th>B</th></tr>
          <tr><td>1</td><td>2</td></tr>
          <tr><td>3</td><td>4</td></tr>
          <tr><td>5</td><td>6</td></tr>
        </table>
      `;
      const result = parseHtmlTable(html);

      expect(result).toContain('<td><p>1</p></td>');
      expect(result).toContain('<td><p>3</p></td>');
      expect(result).toContain('<td><p>5</p></td>');
    });
  });

  describe('parseTextTable', () => {
    it('returns null for single line', () => {
      expect(parseTextTable('single line')).toBeNull();
    });

    it('returns null for text without tabs or pipes', () => {
      expect(parseTextTable('line 1\nline 2\nline 3')).toBeNull();
    });

    it('parses tab-separated table', () => {
      const text = 'Header1\tHeader2\nValue1\tValue2';
      const result = parseTextTable(text);

      expect(result).toContain('<th><p>Header1</p></th>');
      expect(result).toContain('<th><p>Header2</p></th>');
      expect(result).toContain('<td><p>Value1</p></td>');
      expect(result).toContain('<td><p>Value2</p></td>');
    });

    it('parses pipe-separated table (Markdown style)', () => {
      const text = '| Header1 | Header2 |\n| --- | --- |\n| Value1 | Value2 |';
      const result = parseTextTable(text);

      expect(result).toContain('<th><p>Header1</p></th>');
      expect(result).toContain('<td><p>Value1</p></td>');
    });

    it('skips Markdown separator line', () => {
      const text = '| A | B |\n|---|---|\n| 1 | 2 |';
      const result = parseTextTable(text);

      // Separator line should not create a row
      expect(result).not.toContain('---');
    });

    it('handles header-only table', () => {
      const text = 'Col1\tCol2';
      // Single line returns null
      expect(parseTextTable(text)).toBeNull();
    });

    it('handles Excel-style paste (tabs)', () => {
      const text = 'Name\tAge\tCity\nJohn\t30\tNY\nJane\t25\tLA';
      const result = parseTextTable(text);

      expect(result).toContain('<th><p>Name</p></th>');
      expect(result).toContain('<th><p>Age</p></th>');
      expect(result).toContain('<td><p>John</p></td>');
      expect(result).toContain('<td><p>30</p></td>');
      expect(result).toContain('<td><p>Jane</p></td>');
    });

    it('handles pipes without leading/trailing pipe', () => {
      const text = 'A | B | C\n1 | 2 | 3';
      const result = parseTextTable(text);

      expect(result).toContain('<th><p>A</p></th>');
      expect(result).toContain('<td><p>1</p></td>');
    });

    it('trims whitespace from cells', () => {
      const text = '  Header  \t  Value  \n  A  \t  B  ';
      const result = parseTextTable(text);

      expect(result).toContain('<th><p>Header</p></th>');
      expect(result).toContain('<th><p>Value</p></th>');
      expect(result).toContain('<td><p>A</p></td>');
      expect(result).toContain('<td><p>B</p></td>');
    });
  });
});
