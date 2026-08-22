import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdown-converter';
import { sanitizeSafeHtml, sanitizeSafeInlineHtmlTag } from '../../utils/safe-html';

describe('safe README HTML', () => {
  it('preserves centered image blocks exactly through visual HTML', () => {
    const markdown = '<p align="center">\n  <img src="assets/banner.jpeg" alt="Banner" width="600">\n</p>';
    const html = markdownToHtml(markdown);

    expect(html).toContain('data-safe-html-block=');
    expect(htmlToMarkdown(html)).toBe(markdown);
  });

  it('preserves linked badges and details blocks', () => {
    const markdown = '<details open>\n<summary>More</summary>\n<p><a href="https://example.com"><img src="badge.svg" alt="Badge"></a></p>\n</details>';
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown);
  });

  it('round-trips apostrophes and attribute quotes without truncating the HTML block', () => {
    const markdown = `<details open>\n<summary>What's new?</summary>\n<p title="It's safe">Don't truncate this text.</p>\n</details>`;
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown);
  });

  it('renders only allowed tags and attributes', () => {
    const rendered = sanitizeSafeHtml('<p align="center" onclick="bad()"><strong>Safe</strong><script>alert(1)</script><img src="javascript:bad" onerror="bad()"></p>');

    expect(rendered).toContain('<p align="center"><strong>Safe</strong>');
    expect(rendered).not.toContain('script');
    expect(rendered).not.toContain('alert');
    expect(rendered).not.toContain('onclick');
    expect(rendered).not.toContain('onerror');
    expect(rendered).not.toContain('javascript:');
  });

  it('sanitizes inline links, formatting, breaks and images', () => {
    expect(sanitizeSafeInlineHtmlTag('<strong class="x">')).toBe('<strong>');
    expect(sanitizeSafeInlineHtmlTag('<br onclick="bad()">')).toBe('<br>');
    expect(sanitizeSafeInlineHtmlTag('<a href="https://example.com" onclick="bad()">')).toBe('<a href="https://example.com">');
    expect(sanitizeSafeInlineHtmlTag('<img src="x.png" alt="X" width="50" onerror="bad()">'))
      .toContain('src="x.png"');
  });

  it('does not intercept native Markdown images, links, formatting or HTML code examples', () => {
    const markdown = [
      '# Title',
      '',
      '![Local image](assets/local.png)',
      '',
      '[Markdown link](https://example.com) with **bold** text.',
      '',
      '```html',
      '<p align="center"><img src="example.png"></p>',
      '```',
      '',
      '<p align="center"><a href="https://example.com"><img src="badge.svg" alt="Badge"></a></p>',
    ].join('\n');

    const html = markdownToHtml(markdown);
    const roundTrip = htmlToMarkdown(html);

    expect(html).toContain('data-original-src="assets/local.png"');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('data-safe-html-block=');
    expect(roundTrip).toContain('![Local image](assets/local.png)');
    expect(roundTrip).toContain('[Markdown link](https://example.com) with **bold** text.');
    expect(roundTrip).toContain('<p align="center"><img src="example.png"></p>');
    expect(roundTrip).toContain('<p align="center"><a href="https://example.com"><img src="badge.svg" alt="Badge"></a></p>');
  });
});
