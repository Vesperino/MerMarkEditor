import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdown-converter';
import {
  safeHtmlRenderableTagSourceLines,
  safeHtmlTagTokens,
  sanitizeSafeHtml,
  sanitizeSafeInlineHtmlTag,
} from '../../utils/safe-html';

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

  it('round-trips nested details blocks as one visual block', () => {
    const markdown = '<details>\n<summary>Outer</summary>\n<details>\n<summary>Inner</summary>\n<p>Nested</p>\n</details>\n</details>';
    const html = markdownToHtml(markdown);

    expect(html.match(/data-safe-html-block=/g)).toHaveLength(1);
    expect(htmlToMarkdown(html)).toBe(markdown);
  });

  it('handles greater-than characters inside quoted attributes', () => {
    const markdown = '<p title="1 > 0">\n<strong title="a > b">Safe</strong>\n</p>';

    expect(safeHtmlTagTokens(markdown).map(token => token.name)).toEqual(['p', 'strong', 'strong', 'p']);
    expect(htmlToMarkdown(markdownToHtml(markdown))).toBe(markdown);
  });

  it('leaves an unclosed block as source text instead of swallowing the document', () => {
    const html = markdownToHtml('<details>\n<summary>Still open</summary>\n\n# Following heading');
    expect(html).not.toContain('data-safe-html-block=');
    expect(html).toContain('>Following heading</h1>');
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

  it('blocks obfuscated and unexpected URL schemes', () => {
    const rendered = sanitizeSafeHtml([
      '<p>',
      '<a href="java\nscript:alert(1)">bad</a>',
      '<a href="file:///secret">file</a>',
      '<a href="https://example.com">web</a>',
      '<img src="data:image/svg+xml,bad">',
      '</p>',
    ].join(''));

    expect(rendered).not.toContain('java');
    expect(rendered).not.toContain('file:///');
    expect(rendered).not.toContain('data:image');
    expect(rendered).toContain('href="https://example.com"');
  });

  it('keeps cursor line metadata aligned after discarded content and comments', () => {
    const raw = '<p>\n<!-- <strong>fake</strong> -->\n<script><strong>fake</strong></script>\n<strong>Real</strong>\n</p>';
    expect(safeHtmlRenderableTagSourceLines(raw)).toEqual([0, 3]);
  });

  it('sanitizes inline links, formatting, breaks and images', () => {
    expect(sanitizeSafeInlineHtmlTag('<strong class="x">')).toBe('<strong>');
    expect(sanitizeSafeInlineHtmlTag('<br onclick="bad()">')).toBe('<br>');
    expect(sanitizeSafeInlineHtmlTag('<a href="https://example.com" onclick="bad()">')).toBe('<a href="https://example.com">');
    expect(sanitizeSafeInlineHtmlTag('<img src="x.png" alt="X" width="50" onerror="bad()">'))
      .toContain('src="x.png"');
    expect(sanitizeSafeInlineHtmlTag('<a href="https://example.com?q=1>0" title="1 > 0">'))
      .toBe('<a href="https://example.com?q=1>0" title="1 > 0">');
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

  it('does not promote tags inside discarded HTML into rendered inline content', () => {
    const html = markdownToHtml('<script><strong>hidden</strong><img src="tracking.png"></script>\n\nVisible');

    expect(html).not.toContain('<strong>hidden</strong>');
    expect(html).not.toContain('<img');
    expect(html).toContain('Visible');
  });
});
