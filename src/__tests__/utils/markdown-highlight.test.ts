import { describe, expect, it } from 'vitest';
import {
  CODE_HIGHLIGHT_CHAR_THRESHOLD,
  escapeHighlightText,
  highlightMarkdown,
} from '../../utils/markdown-highlight';

describe('Markdown code-view highlighting (#128)', () => {
  it('assigns different syntax classes to Markdown constructs', () => {
    const result = highlightMarkdown('# Heading\n\n- **bold** and `code`');

    expect(result.highlighted).toBe(true);
    expect(result.html).toContain('hljs-section');
    expect(result.html).toContain('hljs-bullet');
    expect(result.html).toContain('hljs-strong');
  });

  it('escapes document text before it reaches v-html', () => {
    expect(escapeHighlightText('<img src=x onerror=alert(1)> & text'))
      .toBe('&lt;img src=x onerror=alert(1)&gt; &amp; text');
  });

  it('skips synchronous parsing for very large documents', () => {
    const source = `<unsafe>${'x'.repeat(CODE_HIGHLIGHT_CHAR_THRESHOLD)}`;
    const result = highlightMarkdown(source);

    expect(result.highlighted).toBe(false);
    expect(result.html).toContain('&lt;unsafe&gt;');
    expect(result.html).not.toContain('<unsafe>');
  });
});
