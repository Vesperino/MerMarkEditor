import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities,
  escapeHtml,
  generateSlug,
  htmlToMarkdown,
  markdownToHtml,
  detectLineEnding,
  applyLineEnding,
} from '../../utils/markdown-converter';

describe('decodeHtmlEntities', () => {
  it('decodes basic HTML entities', () => {
    expect(decodeHtmlEntities('&lt;div&gt;')).toBe('<div>');
    expect(decodeHtmlEntities('&amp;')).toBe('&');
    expect(decodeHtmlEntities('&quot;test&quot;')).toBe('"test"');
    expect(decodeHtmlEntities('&#39;single&#39;')).toBe("'single'");
  });

  it('decodes arrow entities', () => {
    expect(decodeHtmlEntities('&rarr;')).toBe('→');
    expect(decodeHtmlEntities('&larr;')).toBe('←');
    expect(decodeHtmlEntities('A &rarr; B')).toBe('A → B');
  });

  it('decodes hex entities', () => {
    expect(decodeHtmlEntities('&#x1F600;')).toBe('😀');
    expect(decodeHtmlEntities('&#x2192;')).toBe('→');
  });

  it('decodes decimal entities', () => {
    expect(decodeHtmlEntities('&#8594;')).toBe('→');
    expect(decodeHtmlEntities('&#128512;')).toBe('😀');
  });

  it('handles mixed content', () => {
    expect(decodeHtmlEntities('Hello &amp; goodbye &rarr; see you!')).toBe('Hello & goodbye → see you!');
  });
});

describe('escapeHtml', () => {
  it('escapes basic HTML characters', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes multiple occurrences', () => {
    expect(escapeHtml('<p>1 < 2 && 2 > 1</p>')).toBe('&lt;p&gt;1 &lt; 2 &amp;&amp; 2 &gt; 1&lt;/p&gt;');
  });

  it('preserves safe characters', () => {
    expect(escapeHtml('Hello World!')).toBe('Hello World!');
  });
});

describe('generateSlug', () => {
  it('converts to lowercase', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('removes special characters', () => {
    expect(generateSlug('Hello! World?')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(generateSlug('multiple   spaces')).toBe('multiple-spaces');
  });

  it('handles Polish characters', () => {
    expect(generateSlug('Architecture Decision')).toBe('architecture-decision');
  });
});

describe('htmlToMarkdown', () => {
  describe('headers', () => {
    it('converts h1-h6 tags', () => {
      expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title');
      expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
      expect(htmlToMarkdown('<h3>Section</h3>')).toBe('### Section');
    });

    it('preserves inline formatting in headers', () => {
      expect(htmlToMarkdown('<h1><strong>Bold</strong> title</h1>')).toBe('# **Bold** title');
    });
  });

  describe('formatting', () => {
    it('converts bold tags', () => {
      expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**');
      expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**');
    });

    it('converts italic tags', () => {
      expect(htmlToMarkdown('<em>italic</em>')).toBe('*italic*');
      expect(htmlToMarkdown('<i>italic</i>')).toBe('*italic*');
    });

    it('converts strikethrough tags', () => {
      expect(htmlToMarkdown('<s>strike</s>')).toBe('~~strike~~');
      expect(htmlToMarkdown('<del>deleted</del>')).toBe('~~deleted~~');
    });
  });

  describe('links', () => {
    it('converts anchor tags', () => {
      expect(htmlToMarkdown('<a href="https://example.com">Link</a>')).toBe('[Link](https://example.com)');
    });

    it('handles links with nested formatting', () => {
      expect(htmlToMarkdown('<a href="url"><strong>Bold Link</strong></a>')).toBe('[Bold Link](url)');
    });
  });

  describe('images', () => {
    it('converts img tags with alt text', () => {
      expect(htmlToMarkdown('<img src="image.png" alt="Description" />')).toBe('![Description](image.png)');
    });

    it('handles img tags without alt text', () => {
      expect(htmlToMarkdown('<img src="image.png" />')).toBe('![](image.png)');
    });
  });

  describe('inline code', () => {
    it('converts code tags', () => {
      expect(htmlToMarkdown('<code>const x = 1</code>')).toBe('`const x = 1`');
    });

    it('preserves generic types in inline code', () => {
      expect(htmlToMarkdown('<code>Result&lt;T&gt;</code>')).toBe('`Result<T>`');
      expect(htmlToMarkdown('<code>Entity&lt;TId&gt;</code>')).toBe('`Entity<TId>`');
    });

    it('preserves complex generic types', () => {
      expect(htmlToMarkdown('<code>Map&lt;string, List&lt;T&gt;&gt;</code>')).toBe('`Map<string, List<T>>`');
    });
  });

  describe('code blocks', () => {
    it('converts pre/code blocks', () => {
      const html = '<pre><code class="language-js">const x = 1;</code></pre>';
      expect(htmlToMarkdown(html)).toContain('```js\nconst x = 1;\n```');
    });

    it('handles code blocks without language', () => {
      const html = '<pre><code>plain code</code></pre>';
      expect(htmlToMarkdown(html)).toContain('```\nplain code\n```');
    });
  });

  describe('mermaid blocks', () => {
    it('extracts mermaid code from data-code attribute', () => {
      const html = `<div data-type="mermaid" data-code="${encodeURIComponent('graph LR\n  A --> B')}"></div>`;
      const result = htmlToMarkdown(html);
      expect(result).toContain('```mermaid');
      expect(result).toContain('graph LR');
      expect(result).toContain('A --> B');
    });

    it('preserves single quotes in mermaid code', () => {
      const code = "W->>DB: UPDATE OutboxMessage SET Error = 'message'";
      const html = `<div data-type="mermaid" data-code="${encodeURIComponent(code)}"></div>`;
      const result = htmlToMarkdown(html);
      expect(result).toContain("Error = 'message'");
    });

    it('converts __BR__ placeholder back to <br/>', () => {
      const code = 'A->>B: Line1__BR__Line2';
      const html = `<div data-type="mermaid" data-code="${encodeURIComponent(code)}"></div>`;
      const result = htmlToMarkdown(html);
      expect(result).toContain('Line1<br/>Line2');
    });

    it('handles mermaid with complex sequences', () => {
      const code = `sequenceDiagram
    W->>DB: UPDATE OutboxMessage__BR__SET RetryCount = RetryCount + 1,__BR__Error = 'message'`;
      const html = `<div data-type="mermaid" data-code="${encodeURIComponent(code)}"></div>`;
      const result = htmlToMarkdown(html);
      expect(result).toContain("Error = 'message'");
      expect(result).toContain('<br/>');
    });
  });

  describe('lists', () => {
    it('converts unordered lists', () => {
      const html = '<ul><li><p>Item 1</p></li><li><p>Item 2</p></li></ul>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
    });

    it('converts ordered lists', () => {
      const html = '<ol><li><p>First</p></li><li><p>Second</p></li></ol>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
    });

    it('converts nested lists', () => {
      const html = '<ul><li><p>Parent</p></li></ul><ul><li><p>Child</p></li></ul>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('- Parent');
      expect(result).toContain('- Child');
    });

    it('converts task lists', () => {
      const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Todo</p></li><li data-type="taskItem" data-checked="true"><p>Done</p></li></ul>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('- [ ] Todo');
      expect(result).toContain('- [x] Done');
    });
  });

  describe('tables', () => {
    it('converts HTML tables to markdown', () => {
      const html = `<table>
        <tr><th>Header 1</th><th>Header 2</th></tr>
        <tr><td>Cell 1</td><td>Cell 2</td></tr>
      </table>`;
      const result = htmlToMarkdown(html);
      expect(result).toContain('|Header 1|Header 2|');
      expect(result).toContain('|---|---|');
      expect(result).toContain('|Cell 1|Cell 2|');
    });
  });

  describe('blockquotes', () => {
    it('converts blockquote tags', () => {
      expect(htmlToMarkdown('<blockquote><p>Quote</p></blockquote>')).toContain('> Quote');
    });
  });

  describe('edge cases - generic types preservation', () => {
    it('preserves generic types in list items with inline code', () => {
      const html = '<ul><li><p><code>Result&lt;T&gt;</code> - description</p></li></ul>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('`Result<T>`');
    });

    it('preserves multiple generic types in same line', () => {
      const html = '<p><code>Entity&lt;TId&gt;</code> and <code>Result&lt;T&gt;</code></p>';
      const result = htmlToMarkdown(html);
      expect(result).toContain('`Entity<TId>`');
      expect(result).toContain('`Result<T>`');
    });

    it('preserves nested generic types', () => {
      const html = '<code>ICommandHandler&lt;T,R&gt;</code>';
      const result = htmlToMarkdown(html);
      expect(result).toBe('`ICommandHandler<T,R>`');
    });
  });
});

describe('markdownToHtml', () => {
  describe('headers', () => {
    it('converts markdown headers to HTML', () => {
      expect(markdownToHtml('# Title')).toContain('<h1');
      expect(markdownToHtml('## Subtitle')).toContain('<h2');
    });

    it('generates slug IDs for headers', () => {
      const result = markdownToHtml('# Hello World');
      expect(result).toContain('id="hello-world"');
    });
  });

  describe('formatting', () => {
    it('converts bold', () => {
      expect(markdownToHtml('**bold**')).toContain('<strong>bold</strong>');
    });

    it('converts italic', () => {
      expect(markdownToHtml('*italic*')).toContain('<em>italic</em>');
    });

    it('converts strikethrough', () => {
      expect(markdownToHtml('~~strike~~')).toContain('<s>strike</s>');
    });
  });

  describe('code', () => {
    it('converts inline code', () => {
      expect(markdownToHtml('`code`')).toContain('<code>code</code>');
    });

    it('converts code blocks', () => {
      const md = '```js\nconst x = 1;\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('<pre><code');
      expect(result).toContain('language-js');
    });

    it('escapes HTML in code blocks', () => {
      const md = '```\n<div>test</div>\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('&lt;div&gt;');
    });
  });

  describe('mermaid', () => {
    it('converts mermaid blocks to div with data-code', () => {
      const md = '```mermaid\ngraph LR\n  A --> B\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('data-type="mermaid"');
      expect(result).toContain('data-code=');
    });

    it('converts <br> tags to __BR__ placeholder', () => {
      const md = '```mermaid\nA->>B: Line1<br/>Line2\n```';
      const result = markdownToHtml(md);
      expect(result).toContain('__BR__');
      expect(result).not.toContain('<br');
    });

    it('encodes mermaid code properly', () => {
      const md = '```mermaid\ngraph LR\n  A[Start] --> B[End]\n```';
      const result = markdownToHtml(md);
      const match = result.match(/data-code="([^"]*)"/);
      expect(match).toBeTruthy();
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        expect(decoded).toContain('graph LR');
      }
    });
  });

  describe('links and images', () => {
    it('converts links', () => {
      expect(markdownToHtml('[Link](https://example.com)')).toContain('href="https://example.com"');
    });

    it('converts images', () => {
      expect(markdownToHtml('![Alt](image.png)')).toContain('src="image.png"');
      expect(markdownToHtml('![Alt](image.png)')).toContain('alt="Alt"');
    });
  });

  describe('lists', () => {
    it('converts unordered lists', () => {
      const md = '- Item 1\n- Item 2';
      const result = markdownToHtml(md);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });

    it('converts ordered lists', () => {
      const md = '1. First\n2. Second';
      const result = markdownToHtml(md);
      expect(result).toContain('<ol>');
    });

    it('converts nested lists', () => {
      const md = '- Parent\n  - Child';
      const result = markdownToHtml(md);
      expect(result).toContain('<ul>');
      expect(result.match(/<ul>/g)?.length).toBeGreaterThanOrEqual(2);
    });

    it('converts task lists', () => {
      const md = '- [ ] Todo\n- [x] Done';
      const result = markdownToHtml(md);
      expect(result).toContain('data-type="taskItem"');
      expect(result).toContain('data-checked="false"');
      expect(result).toContain('data-checked="true"');
    });
  });

  describe('tables', () => {
    it('converts markdown tables', () => {
      const md = '| A | B |\n| --- | --- |\n| 1 | 2 |';
      const result = markdownToHtml(md);
      expect(result).toContain('<table');
      expect(result).toContain('<th>');
      expect(result).toContain('<td>');
    });

    it('renders blank cells as empty td elements', () => {
      const md = '| Field | Col1 | Col2 | Col3 |\n| --- | --- | --- | --- |\n| Name |  |  |  |\n| Date | 2026-01-29 |  |  |';
      const result = markdownToHtml(md);
      // Row with "Name" should have 4 td elements (1 with content + 3 empty)
      const nameRowMatch = result.match(/<tr><td><p>Name<\/p><\/td>(<td><\/td>){3}<\/tr>/);
      expect(nameRowMatch).toBeTruthy();
      // Row with "Date" should have 4 td elements (2 with content + 2 empty)
      const dateRowMatch = result.match(/<tr><td><p>Date<\/p><\/td><td><p>2026-01-29<\/p><\/td>(<td><\/td>){2}<\/tr>/);
      expect(dateRowMatch).toBeTruthy();
    });
  });

  describe('blockquotes', () => {
    it('converts blockquotes', () => {
      const result = markdownToHtml('> Quote');
      expect(result).toContain('<blockquote>');
    });
  });

  describe('horizontal rule', () => {
    it('converts ---', () => {
      expect(markdownToHtml('---')).toContain('<hr');
    });
  });

  describe('paragraphs starting with inline formatting', () => {
    it('wraps lines starting with bold in p tags', () => {
      const md = '**Objective:** Provide a holistic view.';
      const result = markdownToHtml(md);
      expect(result).toContain('<p><strong>Objective:</strong> Provide a holistic view.</p>');
    });

    it('wraps lines starting with italic in p tags', () => {
      const md = '*Note:* This is important.';
      const result = markdownToHtml(md);
      expect(result).toContain('<p><em>Note:</em> This is important.</p>');
    });

    it('preserves paragraph breaks between bold-starting lines', () => {
      const md = 'First paragraph.\n\n**Second:** paragraph with bold start.\n\n**Third:** another bold start.';
      const result = markdownToHtml(md);
      expect(result).toContain('<p>First paragraph.</p>');
      expect(result).toContain('<p><strong>Second:</strong> paragraph with bold start.</p>');
      expect(result).toContain('<p><strong>Third:</strong> another bold start.</p>');
    });
  });
});

describe('round-trip conversion', () => {
  it('preserves basic markdown through round-trip', () => {
    const original = '# Title\n\nParagraph with **bold** and *italic*.';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('# Title');
    expect(roundTrip).toContain('**bold**');
    expect(roundTrip).toContain('*italic*');
  });

  it('preserves code blocks with generic types', () => {
    const original = '`Result<T>` is a type';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('`Result<T>`');
  });

  it('preserves mermaid diagrams with <br/>', () => {
    const original = '```mermaid\nA->>B: Line1<br/>Line2\n```';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('<br/>');
  });

  it('preserves mermaid diagrams with single quotes', () => {
    const original = "```mermaid\nW->>DB: SET Error = 'message'\n```";
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain("Error = 'message'");
  });

  it('preserves list items', () => {
    const original = '- Item 1\n- Item 2\n- Item 3';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- Item 1');
    expect(roundTrip).toContain('- Item 2');
    expect(roundTrip).toContain('- Item 3');
  });

  it('preserves task lists', () => {
    const original = '- [ ] Todo\n- [x] Done';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- [ ] Todo');
    expect(roundTrip).toContain('- [x] Done');
  });

  it('preserves tables with blank cells', () => {
    const original = '| Field | Col1 | Col2 |\n| --- | --- | --- |\n| Name |  |  |\n| Date | 2026-01-29 |  |';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('|Field|Col1|Col2|');
    expect(roundTrip).toContain('|Name|||');
    expect(roundTrip).toContain('|Date|2026-01-29||');
  });
});

describe('nested list round-trip', () => {
  it('preserves simple nested unordered list', () => {
    const original = '- Parent\n  - Child 1\n  - Child 2';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- Parent');
    expect(roundTrip).toContain('  - Child 1');
    expect(roundTrip).toContain('  - Child 2');
  });

  it('preserves deeply nested list (3 levels)', () => {
    const original = '- Level 1\n  - Level 2\n    - Level 3';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- Level 1');
    expect(roundTrip).toContain('  - Level 2');
    expect(roundTrip).toContain('    - Level 3');
  });

  it('preserves nested list with multiple parents', () => {
    const original = '- Parent A\n  - Child A1\n  - Child A2\n- Parent B\n  - Child B1';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- Parent A');
    expect(roundTrip).toContain('  - Child A1');
    expect(roundTrip).toContain('  - Child A2');
    expect(roundTrip).toContain('- Parent B');
    expect(roundTrip).toContain('  - Child B1');
  });

  it('preserves nested ordered list inside unordered', () => {
    const original = '- Item\n  1. Sub one\n  2. Sub two';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- Item');
    expect(roundTrip).toContain('  1. Sub one');
    expect(roundTrip).toContain('  2. Sub two');
  });

  it('preserves issue #13 example: space+space+dash nested items', () => {
    const original = '- Main item\n  - Sub item with content\n  - Another sub item';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toBe(original);
  });

  it('markdownToHtml generates proper nested HTML', () => {
    const md = '- Parent\n  - Child';
    const html = markdownToHtml(md);
    // Should produce nested <ul> structure
    expect(html).toContain('<ul>');
    expect(html).toContain('<li><p>Parent</p>');
    expect(html).toContain('<li><p>Child</p>');
    // The child should be in a nested <ul> inside parent's <li>
    const parentLiStart = html.indexOf('<li><p>Parent</p>');
    const nestedUlStart = html.indexOf('<ul>', parentLiStart);
    const parentLiEnd = html.indexOf('</li>', nestedUlStart);
    expect(nestedUlStart).toBeGreaterThan(parentLiStart);
    expect(parentLiEnd).toBeGreaterThan(nestedUlStart);
  });

  it('htmlToMarkdown handles nested <ul> inside <li>', () => {
    const html = '<ul><li><p>Parent</p><ul><li><p>Child 1</p></li><li><p>Child 2</p></li></ul></li></ul>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('- Parent');
    expect(md).toContain('  - Child 1');
    expect(md).toContain('  - Child 2');
  });
});

describe('formatting preservation', () => {
  it('does not add plaintext language to code blocks without language', () => {
    const original = '```\nsome code\n```';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('```\n');
    expect(roundTrip).not.toContain('```plaintext');
  });

  it('preserves explicit language on code blocks', () => {
    const original = '```javascript\nconsole.log("hi");\n```';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('```javascript\n');
  });

  it('does not add spaces to table pipes', () => {
    const original = '|colA|colB|colC|\n|---|---|---|\n|a1|b1|c1|';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('|colA|colB|colC|');
    expect(roundTrip).toContain('|---|---|---|');
    expect(roundTrip).toContain('|a1|b1|c1|');
  });

  it('does not add blank line between heading and following text', () => {
    const original = '## Heading\ntext right after';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toBe('## Heading\ntext right after');
  });

  it('groups consecutive text lines as single paragraph with hard break', () => {
    const original = 'line1\nline2\nline3';
    const html = markdownToHtml(original);
    expect(html).toContain('<p>line1<br>line2<br>line3</p>');
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toBe('line1\nline2\nline3');
  });

  it('keeps blank-line-separated paragraphs as separate paragraphs', () => {
    const original = 'paragraph one\n\nparagraph two';
    const html = markdownToHtml(original);
    expect(html).toContain('<p>paragraph one</p>');
    expect(html).toContain('<p>paragraph two</p>');
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toBe('paragraph one\n\nparagraph two');
  });

  it('preserves blank line between list and following paragraph', () => {
    const original = '- item1\n- item2\n\nfollowing text';
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    expect(roundTrip).toContain('- item2\n\nfollowing text');
  });

  it('roundtrips sample document with minimal formatting changes', () => {
    const original = [
      '# sample',
      '',
      '## 1.first',
      'line1-1',
      'line1-2',
      '',
      '---',
      '',
      '## 2.second',
      '### 2.1 chapter',
      '',
      '- select1',
      '- select2',
      '- select3',
    ].join('\n');
    const html = markdownToHtml(original);
    const roundTrip = htmlToMarkdown(html);
    // Heading followed by text — no extra blank line
    expect(roundTrip).toContain('## 1.first\nline1-1');
    // Consecutive text lines — no blank line between them
    expect(roundTrip).not.toMatch(/line1-1\n\nline1-2/);
    // HR preserved with surrounding blank lines
    expect(roundTrip).toContain('---');
    // Consecutive headings separated properly
    expect(roundTrip).toContain('## 2.second\n### 2.1 chapter');
  });
});

describe('detectLineEnding', () => {
  it('detects CRLF line endings', () => {
    expect(detectLineEnding('line1\r\nline2\r\nline3')).toBe('\r\n');
  });

  it('detects LF line endings', () => {
    expect(detectLineEnding('line1\nline2\nline3')).toBe('\n');
  });

  it('detects CR line endings', () => {
    expect(detectLineEnding('line1\rline2\rline3')).toBe('\r');
  });

  it('defaults to LF for text without line endings', () => {
    expect(detectLineEnding('single line')).toBe('\n');
  });

  it('detects majority line ending in mixed content', () => {
    // 3 CRLF vs 1 LF
    expect(detectLineEnding('a\r\nb\r\nc\r\nd\ne')).toBe('\r\n');
  });
});

describe('applyLineEnding', () => {
  it('converts LF to CRLF', () => {
    expect(applyLineEnding('line1\nline2\nline3', '\r\n')).toBe('line1\r\nline2\r\nline3');
  });

  it('keeps LF when target is LF', () => {
    expect(applyLineEnding('line1\nline2', '\n')).toBe('line1\nline2');
  });

  it('converts CRLF input to LF', () => {
    expect(applyLineEnding('line1\r\nline2\r\n', '\n')).toBe('line1\nline2\n');
  });

  it('converts mixed input to CRLF', () => {
    expect(applyLineEnding('a\r\nb\nc\rd', '\r\n')).toBe('a\r\nb\r\nc\r\nd');
  });

  it('converts to CR', () => {
    expect(applyLineEnding('line1\nline2\nline3', '\r')).toBe('line1\rline2\rline3');
  });
});

describe('line ending preservation through conversion', () => {
  it('htmlToMarkdown output can be converted to CRLF', () => {
    const html = '<h1>Title</h1><p>Content</p>';
    const md = htmlToMarkdown(html);
    const withCrlf = applyLineEnding(md, '\r\n');
    expect(withCrlf).toContain('\r\n');
    expect(withCrlf).not.toMatch(/(?<!\r)\n/);
  });

  it('round-trip with CRLF preservation produces CRLF output', () => {
    const original = '# Title\r\n\r\nParagraph text.\r\n';
    const lineEnding = detectLineEnding(original);
    expect(lineEnding).toBe('\r\n');

    const html = markdownToHtml(original);
    const md = htmlToMarkdown(html);
    const restored = applyLineEnding(md, lineEnding);

    expect(restored).not.toMatch(/(?<!\r)\n/);
    expect(restored).toContain('# Title');
    expect(restored).toContain('Paragraph text.');
  });
});
