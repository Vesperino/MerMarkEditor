/**
 * Markdown converter - main entry point.
 * Re-exports from focused sub-modules for backward compatibility.
 */
export { decodeHtmlEntities, escapeHtml, generateSlug } from './html-entities';
export { convertInlineToMarkdown, extractMermaidCode, parseHtmlList, processHtmlLists } from './html-to-markdown';
export {
  parseMarkdownLists,
  convertMarkdownTables,
  convertMarkdownHeaders,
  convertMarkdownFormatting,
  convertMarkdownLinksAndImages,
  extractCodeBlocks,
  restoreCodeBlocks,
} from './markdown-to-html';

import { decodeHtmlEntities, escapeHtml } from './html-entities';
import { convertInlineToMarkdown, extractMermaidCode, parseHtmlList, processHtmlLists } from './html-to-markdown';
import {
  parseMarkdownLists,
  convertMarkdownTables,
  convertMarkdownHeaders,
  convertMarkdownFormatting,
  convertMarkdownLinksAndImages,
  extractCodeBlocks,
  restoreCodeBlocks,
} from './markdown-to-html';

export function htmlToMarkdown(html: string): string {
  let md = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const protectedBlocks: string[] = [];

  // Mermaid blocks - extract first
  md = md.replace(/<div[^>]*data-type=["']mermaid["'][^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const code = extractMermaidCode(match);
    if (code) {
      const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(`\n\`\`\`mermaid\n${code}\n\`\`\`\n`);
      return placeholder;
    }
    return '';
  });

  // Code blocks - extract language from class attribute
  md = md.replace(/<pre[^>]*>\s*<code[^>]*class=["']language-(\w+)["'][^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, lang, code) => {
    const decodedCode = decodeHtmlEntities(code);
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    protectedBlocks.push(`\n\`\`\`${lang}\n${decodedCode}\n\`\`\`\n`);
    return placeholder;
  });

  // Code blocks without language
  md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    const decodedCode = decodeHtmlEntities(code);
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    protectedBlocks.push(`\n\`\`\`\n${decodedCode}\n\`\`\`\n`);
    return placeholder;
  });

  // Tables - convert links inside cells before stripping other tags
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    let result = '\n';
    const rows = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let isHeader = true;

    rows.forEach((row: string, index: number) => {
      const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      const cellValues = cells.map((cell: string) => {
        let cellContent = cell
          .replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i, '$1')
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1');
        cellContent = cellContent.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
          const cleanText = text.replace(/<[^>]+>/g, '').trim();
          return `[${cleanText}](${href})`;
        });
        return cellContent
          .replace(/<[^>]+>/g, '')
          .trim();
      });

      result += '| ' + cellValues.join(' | ') + ' |\n';

      if (isHeader && index === 0) {
        result += '| ' + cellValues.map(() => '---').join(' | ') + ' |\n';
        isHeader = false;
      }
    });

    return result + '\n';
  });

  // Task lists
  md = md.replace(/<ul[^>]*data-type=["']taskList["'][^>]*>([\s\S]*?)<\/ul>/gi, (match) => {
    const content = match.replace(/^<ul[^>]*>([\s\S]*)<\/ul>$/i, '$1');
    return '\n' + parseHtmlList(content, 0, false);
  });

  md = processHtmlLists(md);

  // Headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>\n?/gi, (_, content) => `\n# ${convertInlineToMarkdown(content)}\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>\n?/gi, (_, content) => `\n## ${convertInlineToMarkdown(content)}\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>\n?/gi, (_, content) => `\n### ${convertInlineToMarkdown(content)}\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>\n?/gi, (_, content) => `\n#### ${convertInlineToMarkdown(content)}\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>\n?/gi, (_, content) => `\n##### ${convertInlineToMarkdown(content)}\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>\n?/gi, (_, content) => `\n###### ${convertInlineToMarkdown(content)}\n`);

  // Blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const innerContent = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1');
    const text = convertInlineToMarkdown(innerContent);
    return `\n> ${text}\n\n`;
  });

  // Horizontal rule
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Links - must be BEFORE formatting to avoid capturing **text** inside links
  md = md.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    return `[${cleanText}](${href})`;
  });

  // Formatting
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
  md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~');
  md = md.replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');

  // Unsupported tags - strip but keep content
  md = md.replace(/<sup[^>]*>(.*?)<\/sup>/gi, '$1');
  md = md.replace(/<sub[^>]*>(.*?)<\/sub>/gi, '$1');
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, '$1');
  md = md.replace(/<mark[^>]*>(.*?)<\/mark>/gi, '$1');

  // Inline code
  md = md.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
    const decoded = decodeHtmlEntities(content);
    return `\`${decoded}\``;
  });

  // Images
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, '![$2]($1)');
  md = md.replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![$1]($2)');
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, '![]($1)');

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br[^>]*\/?>/gi, '  \n');

  // Remove remaining tags
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');
  md = md.replace(/<\/?div[^>]*>/gi, '\n');

  md = decodeHtmlEntities(md);

  // Restore protected blocks
  protectedBlocks.forEach((block, index) => {
    md = md.replace(`__PROTECTED_BLOCK_${index}__`, block);
  });

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

export function markdownToHtml(md: string): string {
  let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract code blocks before escaping
  const extracted = extractCodeBlocks(html);
  html = extracted.html;
  const codeBlocks = extracted.codeBlocks;

  html = escapeHtml(html);

  // Tables
  html = convertMarkdownTables(html);

  // Task lists
  html = html.replace(/^- \[([ x])\] (.*)$/gim, (_, checked, text) => {
    const isChecked = checked === 'x';
    return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? 'checked' : ''}></label><p>${text}</p></li>`;
  });
  html = html.replace(/(<li data-type="taskItem"[^>]*>[\s\S]*?<\/li>\n?)+/g, '<ul data-type="taskList">$&</ul>');

  // Headers
  html = convertMarkdownHeaders(html);

  // Formatting + inline code
  html = convertMarkdownFormatting(html);

  // Links and images
  html = convertMarkdownLinksAndImages(html);

  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr />');

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

  // Lists
  html = parseMarkdownLists(html);

  // Paragraphs - exclude only block-level elements and placeholders, not inline elements
  html = html.replace(/^(?!<[huplodtb]|<\/|<hr|<img|__)(.+)$/gim, '<p>$1</p>');
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Restore code blocks
  html = restoreCodeBlocks(html, codeBlocks);

  return html;
}

export function detectLineEnding(text: string): string {
  const crlfCount = (text.match(/\r\n/g) || []).length;
  const lfCount = (text.match(/(?<!\r)\n/g) || []).length;
  const crCount = (text.match(/\r(?!\n)/g) || []).length;

  if (crlfCount === 0 && lfCount === 0 && crCount === 0) return '\n';
  if (crlfCount >= lfCount && crlfCount >= crCount) return '\r\n';
  if (crCount > lfCount) return '\r';
  return '\n';
}

export function applyLineEnding(text: string, lineEnding: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (lineEnding === '\n') return normalized;
  return normalized.replace(/\n/g, lineEnding);
}
