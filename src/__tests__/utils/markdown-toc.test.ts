import { describe, expect, it } from 'vitest';
import { extractMarkdownToc } from '../../utils/markdown-toc';

describe('extractMarkdownToc', () => {
  it('extracts ATX and setext headings with source offsets', () => {
    const markdown = '# One\n\nTwo\n---\n\n### Three';
    expect(extractMarkdownToc(markdown)).toEqual([
      { level: 1, text: 'One', offset: 0 },
      { level: 2, text: 'Two', offset: 7 },
      { level: 3, text: 'Three', offset: 16 },
    ]);
  });

  it('ignores headings in frontmatter and fenced code', () => {
    const markdown = '---\ntitle: hidden\n---\n\n```md\n# hidden\n```\n\n## Visible';
    expect(extractMarkdownToc(markdown).map(item => item.text)).toEqual(['Visible']);
  });

  it('scans a 3 MB document without converting it to HTML', () => {
    const markdown = ('# Heading\n\nParagraph\n\n').repeat(145_000);
    expect(markdown.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(extractMarkdownToc(markdown)).toHaveLength(145_000);
  });
});
