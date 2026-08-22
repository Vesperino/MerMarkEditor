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
});
