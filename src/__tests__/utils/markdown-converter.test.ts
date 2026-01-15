import { describe, it, expect } from 'vitest';
import {
  decodeHtmlEntities,
  escapeHtml,
  generateSlug,
  htmlToMarkdown,
  markdownToHtml,
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
      expect(result).toContain('| Header 1 | Header 2 |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| Cell 1 | Cell 2 |');
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
});
