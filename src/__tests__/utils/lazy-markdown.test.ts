import { describe, expect, it } from 'vitest';
import { splitMarkdownForLazyPreview } from '../../utils/lazy-markdown';

describe('splitMarkdownForLazyPreview', () => {
  it('bounds ordinary large documents into small chunks', () => {
    const markdown = ('# Heading\n\nParagraph with **formatting**.\n\n').repeat(80_000);
    const chunks = splitMarkdownForLazyPreview(markdown);

    expect(markdown.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(chunks.length).toBeGreaterThan(100);
    expect(Math.max(...chunks.map(chunk => chunk.markdown.length))).toBeLessThan(50 * 1024);
  });

  it('never cuts through a fenced code block', () => {
    const fenced = `\`\`\`text\n${'code line\n'.repeat(10_000)}\`\`\``;
    const markdown = `# Before\n\n${fenced}\n\n# After`;
    const chunks = splitMarkdownForLazyPreview(markdown);
    const containingFence = chunks.filter(chunk => chunk.markdown.includes('```text'));

    expect(containingFence).toHaveLength(1);
    expect(containingFence[0].markdown).toContain('code line\n```');
  });

  it.each(['p', 'details'])('never cuts through a multiline <%s> block', tag => {
    const rawHtml = `<${tag}>\n${'README content\n\n'.repeat(4_000)}</${tag}>`;
    const markdown = `# Before\n\n${rawHtml}\n\n# After`;
    const chunks = splitMarkdownForLazyPreview(markdown);
    const containingStart = chunks.filter(chunk => chunk.markdown.includes(`<${tag}>`));

    expect(containingStart).toHaveLength(1);
    expect(containingStart[0].markdown).toContain(`</${tag}>`);
  });

  it('keeps nested HTML and quoted greater-than attributes in one chunk', () => {
    const rawHtml = `<details data-label="1 > 0">\n<details>\n${'nested\n\n'.repeat(4_000)}</details>\n</details>`;
    const chunks = splitMarkdownForLazyPreview(`# Before\n\n${rawHtml}\n\n# After`);
    const htmlChunk = chunks.find(chunk => chunk.markdown.includes('<details data-label'));

    expect(htmlChunk?.markdown).toContain('</details>\n</details>');
  });

  it('does not treat supported HTML written inside a fence as a raw HTML block', () => {
    const markdown = `\`\`\`html\n<p>\n${'example\n'.repeat(8_000)}\n</p>\n\`\`\`\n\n# After`;
    const chunks = splitMarkdownForLazyPreview(markdown);

    expect(chunks.some(chunk => chunk.markdown.includes('```html') && chunk.markdown.trimEnd().endsWith('```'))).toBe(true);
    expect(chunks[chunks.length - 1]?.markdown).toContain('# After');
  });
});
