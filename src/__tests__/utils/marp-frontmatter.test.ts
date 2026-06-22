import { describe, it, expect } from 'vitest';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown-converter';

const DECK = `---
marp: true
theme: gaia
paginate: true
---

# Slide one

Body text.`;

describe('Marp front matter', () => {
  it('renders leading front matter as a badge, not raw paragraphs', () => {
    const html = markdownToHtml(DECK);
    expect(html).toContain('class="marp-frontmatter"');
    expect(html).toContain('data-marp="true"');
    expect(html).not.toContain('<p>marp: true</p>');
  });

  it('round-trips the raw front matter block', () => {
    const md = htmlToMarkdown(markdownToHtml(DECK));
    expect(md.trimStart().startsWith('---\nmarp: true')).toBe(true);
    expect(md).toContain('---\nmarp: true\ntheme: gaia\npaginate: true\n---');
  });

  it('leaves a document without front matter untouched', () => {
    const html = markdownToHtml('# Hello\n\nWorld');
    expect(html).not.toContain('marp-frontmatter');
  });

  it('renders directive comments as chips and round-trips them (Marp doc)', () => {
    const src = '---\nmarp: true\n---\n\n# A\n\n<!-- _class: lead -->\n\n# B';
    const html = markdownToHtml(src);
    expect(html).toContain('class="marp-directive"');
    expect(html).not.toContain('&lt;!-- _class: lead --&gt;');
    expect(htmlToMarkdown(html)).toContain('<!-- _class: lead -->');
  });

  it('does NOT touch a non-Marp document (no badge, no chips)', () => {
    const fm = markdownToHtml('---\ntitle: x\n---\n\n# A');
    expect(fm).not.toContain('marp-frontmatter');
    const cmt = markdownToHtml('# A\n\n<!-- note -->\n\n# B');
    expect(cmt).not.toContain('marp-directive');
  });
});
