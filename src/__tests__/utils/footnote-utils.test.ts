import { describe, it, expect } from 'vitest';
import {
  extractFootnoteDefinitions,
  convertFootnoteRefsToHtml,
  buildFootnoteSectionHtml,
  convertHtmlFootnoteRefsToMd,
  extractHtmlFootnoteSection,
} from '../../utils/footnote-utils';

describe('extractFootnoteDefinitions', () => {
  it('extracts a single-line definition', () => {
    const md = 'Text[^1]\n\n[^1]: Footnote text.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toEqual([{ label: '1', content: 'Footnote text.' }]);
    expect(cleanedMd).toBe('Text[^1]\n');
  });

  it('extracts multiple definitions', () => {
    const md = 'Text[^1] and [^2].\n\n[^1]: First.\n[^2]: Second.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toEqual({ label: '1', content: 'First.' });
    expect(definitions[1]).toEqual({ label: '2', content: 'Second.' });
    expect(cleanedMd).toBe('Text[^1] and [^2].\n');
  });

  it('extracts definitions with named labels', () => {
    const md = 'Text[^note].\n\n[^note]: A named footnote.';
    const { definitions } = extractFootnoteDefinitions(md);
    expect(definitions[0].label).toBe('note');
    expect(definitions[0].content).toBe('A named footnote.');
  });

  it('handles multi-line definitions with 4-space continuation', () => {
    const md = '[^1]: First line\n    continuation line\n    another line';
    const { definitions } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].content).toBe('First line\ncontinuation line\nanother line');
  });

  it('handles multi-paragraph definitions (blank line + indented continuation)', () => {
    const md = '[^1]: First paragraph.\n\n    Second paragraph.';
    const { definitions } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].content).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('terminates definition at blank line not followed by indented content', () => {
    const md = '[^1]: Footnote.\n\nRegular paragraph.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(1);
    expect(definitions[0].content).toBe('Footnote.');
    expect(cleanedMd).toContain('Regular paragraph.');
  });

  it('handles definitions scattered in the document', () => {
    const md = 'Intro[^1].\n\n[^1]: First footnote.\n\nMiddle[^2].\n\n[^2]: Second footnote.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(2);
    expect(cleanedMd).toContain('Intro[^1].');
    expect(cleanedMd).toContain('Middle[^2].');
    expect(cleanedMd).not.toContain('[^1]:');
    expect(cleanedMd).not.toContain('[^2]:');
  });

  it('returns empty definitions when none exist', () => {
    const md = 'No footnotes here.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(0);
    expect(cleanedMd).toBe(md);
  });

  it('does not match definitions inside content (non-start-of-line)', () => {
    const md = 'Text with [^1]: not a definition.';
    const { definitions, cleanedMd } = extractFootnoteDefinitions(md);
    expect(definitions).toHaveLength(0);
    expect(cleanedMd).toBe(md);
  });
});

describe('convertFootnoteRefsToHtml', () => {
  const defs = [
    { label: '1', content: 'First' },
    { label: 'note', content: 'Named' },
  ];

  it('converts [^1] to <sup>', () => {
    const result = convertFootnoteRefsToHtml('Text [^1] here.', defs);
    expect(result).toBe('Text <sup class="footnote-ref" data-footnote-ref="1">1</sup> here.');
  });

  it('converts named refs', () => {
    const result = convertFootnoteRefsToHtml('Text [^note].', defs);
    expect(result).toContain('data-footnote-ref="note"');
    expect(result).toContain('>2</sup>');
  });

  it('leaves unknown refs unchanged', () => {
    const result = convertFootnoteRefsToHtml('Text [^unknown].', defs);
    expect(result).toBe('Text [^unknown].');
  });

  it('skips refs inside <code> tags', () => {
    const result = convertFootnoteRefsToHtml('<code>[^1]</code> and [^1]', defs);
    expect(result).toBe('<code>[^1]</code> and <sup class="footnote-ref" data-footnote-ref="1">1</sup>');
  });

  it('converts multiple refs in one line', () => {
    const result = convertFootnoteRefsToHtml('[^1] and [^note]', defs);
    expect(result).toContain('data-footnote-ref="1">1</sup>');
    expect(result).toContain('data-footnote-ref="note">2</sup>');
  });
});

describe('buildFootnoteSectionHtml', () => {
  it('returns empty string for no definitions', () => {
    expect(buildFootnoteSectionHtml([])).toBe('');
  });

  it('builds section with single definition', () => {
    const html = buildFootnoteSectionHtml([{ label: '1', content: 'Footnote text.' }]);
    expect(html).toContain('<section class="footnotes" data-footnotes>');
    expect(html).toContain('<hr>');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li data-footnote-id="1"><p>Footnote text.</p></li>');
    expect(html).toContain('</ol></section>');
  });

  it('escapes HTML in definition content', () => {
    const html = buildFootnoteSectionHtml([{ label: '1', content: 'Use <div> tag.' }]);
    expect(html).toContain('&lt;div&gt;');
  });

  it('builds section with multiple definitions', () => {
    const defs = [
      { label: '1', content: 'First.' },
      { label: '2', content: 'Second.' },
    ];
    const html = buildFootnoteSectionHtml(defs);
    expect(html).toContain('data-footnote-id="1"');
    expect(html).toContain('data-footnote-id="2"');
  });
});

describe('convertHtmlFootnoteRefsToMd', () => {
  it('converts <sup> to [^label]', () => {
    const html = 'Text <sup class="footnote-ref" data-footnote-ref="1">1</sup> here.';
    expect(convertHtmlFootnoteRefsToMd(html)).toBe('Text [^1] here.');
  });

  it('handles multiple refs', () => {
    const html = '<sup class="footnote-ref" data-footnote-ref="1">1</sup> and <sup class="footnote-ref" data-footnote-ref="note">2</sup>';
    const result = convertHtmlFootnoteRefsToMd(html);
    expect(result).toBe('[^1] and [^note]');
  });

  it('leaves non-footnote <sup> tags unchanged', () => {
    const html = '<sup>2</sup>';
    expect(convertHtmlFootnoteRefsToMd(html)).toBe('<sup>2</sup>');
  });
});

describe('extractHtmlFootnoteSection', () => {
  it('returns unchanged html when no section exists', () => {
    const html = '<p>No footnotes.</p>';
    const result = extractHtmlFootnoteSection(html);
    expect(result.html).toBe(html);
    expect(result.definitions).toBe('');
  });

  it('extracts section from markdownToHtml output (li structure)', () => {
    const html = '<p>Text</p><section class="footnotes" data-footnotes><hr><ol><li data-footnote-id="1"><p>Footnote text.</p></li></ol></section>';
    const result = extractHtmlFootnoteSection(html);
    expect(result.html).toBe('<p>Text</p>');
    expect(result.definitions).toBe('[^1]: Footnote text.');
  });

  it('extracts section with data-definitions attribute (Tiptap roundtrip)', () => {
    const defs = JSON.stringify([{ label: '1', content: 'From attribute.' }]);
    const encoded = encodeURIComponent(defs);
    const html = `<p>Text</p><section class="footnotes" data-footnotes="" data-definitions="${encoded}"><hr><ol><li data-footnote-id="1"><p>From attribute.</p></li></ol></section>`;
    const result = extractHtmlFootnoteSection(html);
    expect(result.html).toBe('<p>Text</p>');
    expect(result.definitions).toBe('[^1]: From attribute.');
  });

  it('extracts multiple definitions', () => {
    const html = '<p>Text</p><section class="footnotes" data-footnotes><hr><ol><li data-footnote-id="1"><p>First.</p></li><li data-footnote-id="2"><p>Second.</p></li></ol></section>';
    const result = extractHtmlFootnoteSection(html);
    expect(result.definitions).toBe('[^1]: First.\n[^2]: Second.');
  });

  it('decodes HTML entities in definition content', () => {
    const html = '<section class="footnotes" data-footnotes><hr><ol><li data-footnote-id="1"><p>Use &lt;div&gt; for layout.</p></li></ol></section>';
    const result = extractHtmlFootnoteSection(html);
    expect(result.definitions).toBe('[^1]: Use <div> for layout.');
  });
});
