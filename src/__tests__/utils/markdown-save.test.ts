import { describe, expect, it } from 'vitest';
import { serializeMarkdown } from '../../utils/markdown-save';
import { markdownToHtml } from '../../utils/markdown-converter';

describe('Markdown disk serialization', () => {
  it.each(['\n', '\r\n', '\r'])('restores %j after raw editing without trimming whitespace', ending => {
    const source = 'first\n\nlast\n\n'.replace(/\n/g, ending);
    expect(serializeMarkdown({ markdown: 'firstX\n\nlast  \n\n' }, source, source))
      .toBe('firstX\n\nlast  \n\n'.replace(/\n/g, ending));
  });

  it('preserves unchanged mixed separators exactly through an LF editor', () => {
    const source = '# Heading\r\n\r\nfirst\nlast\r';
    expect(serializeMarkdown({ markdown: '# Heading\n\nfirst\nlast\n' }, source, source)).toBe(source);
  });

  it('uses the saved dominant convention after mixed-EOL source changes', () => {
    const source = '# Heading\r\n\r\nfirst\nlast\r';
    expect(serializeMarkdown({ markdown: '# HeadingX\n\nfirst\nlast\n' }, source, source))
      .toBe('# HeadingX\r\n\r\nfirst\r\nlast\r\n');
  });

  it('uses the latest source for visual patches and keeps disk as the conflict base', () => {
    const disk = 'first\r\nwrapped\r\n\r\nlast\r\n';
    const source = disk.replace('first', 'firstX');
    expect(serializeMarkdown({ html: markdownToHtml(source).replace('last', 'lastY') }, source, disk))
      .toBe(source.replace('last', 'lastY'));
  });

  it('leaves a new raw document exactly as supplied', () => {
    const raw = 'new\r\ntext  \r\n\r\n';
    expect(serializeMarkdown({ markdown: raw })).toBe(raw);
  });
});
