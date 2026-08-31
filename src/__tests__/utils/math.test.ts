import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { KatexBlockExtension, KatexInlineExtension } from '../../extensions/KatexExtension';
import { findMath, mathMarkdown, renderMath, normalizeMathForMarp } from '../../utils/math';
import { htmlToMarkdown, markdownToHtml } from '../../utils/markdown-converter';
import { serializeEditorContent } from '../../utils/documentSerializer';
import { splitMarkdownForLazyPreview } from '../../utils/lazy-markdown';
import { buildPrintDocument, PDF_SETTINGS_DEFAULTS } from '../../composables/usePdfExport';
import { readFileSync } from 'node:fs';

const variants = [
  '$x_1^2$', '$$x_1^2$$', '$$\nx_1^2\n$$', String.raw`\(x_1^2\)`, String.raw`\[x_1^2\]`,
  '```math\nx_1^2\n```', '~~~latex\nx_1^2\n~~~', '````tex\nx_1^2\n````',
  String.raw`\begin{equation}x_1^2\end{equation}`,
  String.raw`\begin{align*}a&=b\\c&=d\end{align*}`,
  '$`x_1^2`$',
  '$$\na+b\n\n\n+c\n$$',
];

describe('math source and editor round trips', () => {
  it.each(variants)('preserves %s through the actual TipTap schema', source => {
    const before = findMath(source);
    expect(before).toHaveLength(1);
    const editor = new Editor({ extensions: [StarterKit, KatexBlockExtension, KatexInlineExtension], content: markdownToHtml(source) });
    const saved = htmlToMarkdown(editor.getHTML());
    expect(saved.trim()).toBe(source);
    expect(findMath(saved).map(m => m.formula)).toEqual(before.map(m => m.formula));
    editor.destroy();
  });

  it.each([
    String.raw`Escaped \$x\$ and \$$y\$$`,
    'Costs $5 and $10 today.',
    '```js\nconst x = "$a$";\n```',
    '~~~text\n$$x$$\n~~~',
    '`$a$` and `` $b$ ``',
    '    $a$\n    $$b$$',
    '[link](https://example.com/$a$)',
    '<img alt="$a$" src="x">',
    '<p>Raw HTML $a$</p>',
    '<pre><code>$a$</code></pre>',
    '<details><details>$a$</details>$b$</details>',
  ])('does not interpret code, escaped dollars or currency: %s', source => {
    expect(findMath(source)).toEqual([]);
    expect(markdownToHtml(source)).not.toContain('data-type="katex-');
  });

  it('handles inline math within lists, tables, emphasis and links', () => {
    const source = '- Value $x_1$\n\n| X | Y |\n|---|---|\n| $a$ | $b$ |\n\n**$c$** and [$d$](https://example.com)';
    const editor = new Editor({ extensions: [StarterKit, KatexBlockExtension, KatexInlineExtension], content: markdownToHtml(source) });
    expect(findMath(htmlToMarkdown(editor.getHTML())).map(m => m.formula)).toEqual(['x_1', 'a', 'b', 'c', 'd']);
    editor.destroy();
  });

  it('does not flatten nested KaTeX HTML on serialization', () => {
    const root = document.createElement('div');
    root.innerHTML = markdownToHtml('Before $a$ after\n\n$$b$$');
    const printed = serializeEditorContent(root);
    const saved = htmlToMarkdown(printed);
    expect(findMath(saved).map(m => m.formula)).toEqual(['a', 'b']);
    expect(saved).not.toContain('katex');
  });

  it('uses new source after changing formula or display mode', () => {
    expect(mathMarkdown('y', '$x$', false)).toBe('$y$');
    expect(mathMarkdown('x', '$x$', true)).toBe('$$\nx\n$$');
  });

  it('keeps a large multiline display equation inside one lazy chunk', () => {
    const formula = '$$\n' + ('a+\n\n'.repeat(12000)) + 'b\n$$';
    const source = '# Start\n\n' + formula + '\n\nEnd';
    const chunks = splitMarkdownForLazyPreview(source);
    expect(chunks.map(c => c.markdown).join('\n')).toBe(source);
    expect(chunks.some(c => c.markdown.includes(formula))).toBe(true);
  });
});

describe('rendering and exports', () => {
  it('renders all examples in the demonstration document', () => {
    const source = readFileSync('docs/math-showcase.md', 'utf8');
    const math = findMath(source);
    expect(math.length).toBeGreaterThan(25);
    for (const m of math) expect(renderMath(m.formula, m.display).error, m.source).toBeNull();
    const saved = htmlToMarkdown(markdownToHtml(source));
    expect(findMath(saved).map(m => m.source)).toEqual(math.map(m => m.source));
  });

  it('shows malformed input as escaped, recoverable source', () => {
    const result = renderMath(String.raw`\bad{<img src=x onerror="alert(1)">}`, true);
    expect(result.error).not.toBeNull();
    const root = new DOMParser().parseFromString(result.html, 'text/html');
    expect(root.querySelector('img')).toBeNull();
    expect(root.body.textContent).toContain('<img');
  });

  it('does not allow external images or unsafe URLs in formulas', () => {
    expect(renderMath(String.raw`\includegraphics{https://example.com/tracker}`, false).html).not.toContain('<img');
    expect(renderMath(String.raw`\href{javascript:alert(1)}{x}`, false).html).not.toContain('href="javascript:');
  });

  it('prints real math with embedded fonts and without editor controls', () => {
    const html = buildPrintDocument(markdownToHtml('$x$\n\n$$x^2$$'), PDF_SETTINGS_DEFAULTS, '');
    expect(html).toContain('class="katex"');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('url(fonts/');
    expect(html).not.toContain('katex-actions');
  });

  it('normalizes alternative syntaxes for Marp without changing code samples', () => {
    const source = String.raw`\(x\)` + '\n\n```math\ny\n```\n\n`$z$`';
    expect(normalizeMathForMarp(source)).toContain('$x$');
    expect(normalizeMathForMarp(source)).toContain('$$\ny\n$$');
    expect(normalizeMathForMarp(source)).toContain('`$z$`');
  });
});
