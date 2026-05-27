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
  extractPageBreaks,
  restoreCodeBlocks,
} from './markdown-to-html';
export {
  extractFootnoteDefinitions,
  convertFootnoteRefsToHtml,
  buildFootnoteSectionHtml,
  convertHtmlFootnoteRefsToMd,
  extractHtmlFootnoteSection,
} from './footnote-utils';

import { decodeHtmlEntities, escapeHtml } from './html-entities';
import { convertInlineToMarkdown, extractMermaidCode, processHtmlLists } from './html-to-markdown';
import { buildMermaidBlock, getCurrentMermaidDelimiters, type MermaidDelimiters } from './mermaid-delimiters';
import {
  parseMarkdownLists,
  convertMarkdownTables,
  convertMarkdownHeaders,
  convertMarkdownFormatting,
  convertMarkdownLinksAndImages,
  extractCodeBlocks,
  extractPageBreaks,
  restoreCodeBlocks,
} from './markdown-to-html';
import {
  extractFootnoteDefinitions,
  convertFootnoteRefsToHtml,
  buildFootnoteSectionHtml,
  convertHtmlFootnoteRefsToMd,
  extractHtmlFootnoteSection,
} from './footnote-utils';

export function htmlToMarkdown(
  html: string,
  mermaidDelimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): string {
  let md = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const protectedBlocks: string[] = [];

  // Mermaid blocks - extract first.
  // Attributes the user can adjust per-diagram (e.g. dragged width, print
  // scale) are serialized into an HTML comment on the line preceding the
  // fenced block. Format: `<!--mermaid-attrs:k1=v1,k2=v2-->`. The matching
  // `markdownToHtml` parser reads it back into `data-*` attributes so node
  // attrs survive a save/reload round trip.
  md = md.replace(/<div[^>]*data-type=["']mermaid["'][^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const code = extractMermaidCode(match);
    if (code) {
      const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
      const attrPairs: string[] = [];
      const userWidthMatch = match.match(/data-user-width=["']?(\d+)["']?/i);
      if (userWidthMatch) attrPairs.push(`userWidth=${userWidthMatch[1]}`);
      const printScaleMatch = match.match(/data-print-scale=["']?(\d+)["']?/i);
      if (printScaleMatch && printScaleMatch[1] !== '100') {
        // Default scale (100) is implicit — only persist when the user
        // changed it, otherwise every saved diagram carries dead noise.
        attrPairs.push(`printScale=${printScaleMatch[1]}`);
      }
      const splitRatioMatch = match.match(/data-split-ratio=["']?(\d+)["']?/i);
      if (splitRatioMatch && splitRatioMatch[1] !== '50') {
        attrPairs.push(`splitRatio=${splitRatioMatch[1]}`);
      }
      const attrComment = attrPairs.length ? `<!--mermaid-attrs:${attrPairs.join(',')}-->\n` : '';
      protectedBlocks.push(`\n${attrComment}${buildMermaidBlock(code, mermaidDelimiters)}\n`);
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

  // Footnotes — extract section and convert refs before other processing
  const footnoteSection = extractHtmlFootnoteSection(md);
  md = footnoteSection.html;
  md = convertHtmlFootnoteRefsToMd(md);

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

  // Lists (regular + task). processHtmlLists walks every <ul>/<ol> with
  // balanced open/close matching, so nested task lists serialize correctly.
  // (A previous separate task-list pass used a non-greedy `</ul>` regex that
  // stopped at the first nested close tag — issue #95.)
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

  // Page breaks — convert to a text marker that survives the generic
  // "strip remaining <div>" pass below (which would otherwise delete the
  // page-break div and lose it on save/reload). Restored to its persisted
  // HTML form after that strip.
  md = md.replace(/<div[^>]*class=["']page-break["'][^>]*>\s*<\/div>/gi, '\n__PAGE_BREAK_MARKER__\n');

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

  // Images - prefer data-original-src over src, include title if present
  md = md.replace(/<img\s+[^>]*?\/?>/gi, (match) => {
    const srcMatch = match.match(/data-original-src=["']([^"']*)["']/i) || match.match(/src=["']([^"']*)["']/i);
    const altMatch = match.match(/alt=["']([^"']*)["']/i);
    const titleMatch = match.match(/title=["']([^"']*)["']/i);
    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';
    const title = titleMatch ? titleMatch[1] : '';
    return title ? `\n![${alt}](${src} "${title}")\n` : `\n![${alt}](${src})\n`;
  });

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br[^>]*\/?>/gi, '  \n');

  // Remove remaining tags
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, '$1');
  md = md.replace(/<\/?div[^>]*>/gi, '\n');

  // Restore page breaks now that the blanket div strip has run.
  md = md.replace(/__PAGE_BREAK_MARKER__/g, '<div style="page-break-after: always;"></div>');

  md = decodeHtmlEntities(md);

  // Restore protected blocks (with indentation support for blocks inside lists)
  protectedBlocks.forEach((block, index) => {
    const placeholder = `__PROTECTED_BLOCK_${index}__`;
    const pos = md.indexOf(placeholder);
    if (pos === -1) return;

    // Check if the placeholder is on a line with leading whitespace (list context)
    const lineStart = md.lastIndexOf('\n', pos - 1) + 1;
    const linePrefix = md.slice(lineStart, pos);
    const lineEndPos = md.indexOf('\n', pos + placeholder.length);
    const afterPlaceholder = md.slice(pos + placeholder.length, lineEndPos === -1 ? md.length : lineEndPos);

    if (linePrefix.length > 0 && linePrefix.trim() === '' && afterPlaceholder.trim() === '') {
      // Placeholder is on its own indented line - indent the code block content
      const indent = linePrefix;
      const trimmedBlock = block.replace(/^\n+/, '').replace(/\n+$/, '');
      const indentedBlock = trimmedBlock.split('\n').map(line =>
        line.length > 0 ? indent + line : ''
      ).join('\n');
      const replaceEnd = lineEndPos === -1 ? md.length : lineEndPos;
      md = md.slice(0, lineStart) + indentedBlock + md.slice(replaceEnd);
    } else {
      md = md.replace(placeholder, block);
    }
  });

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.trim();

  // Append footnote definitions at end
  if (footnoteSection.definitions) {
    md += '\n\n' + footnoteSection.definitions;
  }

  return md;
}

export function markdownToHtml(
  md: string,
  mermaidDelimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): string {
  let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Extract page breaks and code blocks before escaping
  html = extractPageBreaks(html);
  const extracted = extractCodeBlocks(html, mermaidDelimiters);
  html = extracted.html;
  const codeBlocks = extracted.codeBlocks;

  // Extract footnote definitions before HTML processing
  const footnotes = extractFootnoteDefinitions(html);
  html = footnotes.cleanedMd;
  const footnoteDefs = footnotes.definitions;

  html = escapeHtml(html);

  // Tables
  html = convertMarkdownTables(html);

  // Task lists are handled inside parseMarkdownLists (below) so indented /
  // nested checklist items parse correctly (issue #95) — same nesting engine
  // as bullet/ordered lists.

  // Headers
  html = convertMarkdownHeaders(html);

  // Formatting + inline code
  html = convertMarkdownFormatting(html);

  // Footnote references (after inline code conversion, before links)
  html = convertFootnoteRefsToHtml(html, footnoteDefs);

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

  // Restore page breaks
  html = html.replace(/<p>__PAGE_BREAK__<\/p>/g, '<div class="page-break"></div>');
  html = html.replace(/__PAGE_BREAK__/g, '<div class="page-break"></div>');

  // Append footnotes section
  html += buildFootnoteSectionHtml(footnoteDefs);

  return html.trimEnd();
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
