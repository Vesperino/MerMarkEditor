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
import {
  buildMermaidBlockFor,
  getCurrentMermaidReadFormats,
  getCurrentMermaidWriteFormat,
  type MermaidFormat,
} from './mermaid-formats';
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
  writeFormat: MermaidFormat = getCurrentMermaidWriteFormat(),
): string {
  let md = html.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const protectedBlocks: string[] = [];

  // Front matter badge -> restore raw `---\n…\n---` at the very top before the
  // generic <div> strip below would otherwise delete it.
  md = md.replace(/<div[^>]*data-marp-frontmatter=["']([^"']*)["'][^>]*>[\s\S]*?<\/div>/gi, (_, enc) => {
    let raw = '';
    try { raw = decodeURIComponent(enc); } catch { raw = enc; }
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    protectedBlocks.push(`---\n${raw}\n---\n\n`);
    return placeholder;
  });

  // Directive chip -> restore `<!-- … -->` comment before the generic div strip.
  md = md.replace(/<div[^>]*data-marp-directive=["']([^"']*)["'][^>]*>[\s\S]*?<\/div>/gi, (_, enc) => {
    let raw = '';
    try { raw = decodeURIComponent(enc); } catch { raw = enc; }
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    protectedBlocks.push(`\n<!-- ${raw} -->\n`);
    return placeholder;
  });

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
      protectedBlocks.push(`\n${attrComment}${buildMermaidBlockFor(code, writeFormat)}\n`);
      return placeholder;
    }
    return '';
  });

  // Indented code blocks (issue #118) - written back as 4-space indentation,
  // not fences, so the original document form survives the round trip. Must
  // run before the generic pre/code handlers below, which would otherwise
  // consume the same markup.
  md = md.replace(/<pre[^>]*data-indented=["']true["'][^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
    const decodedCode = decodeHtmlEntities(code).replace(/\n+$/, '');
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    const indented = decodedCode
      .split('\n')
      .map(line => (line.length > 0 ? `    ${line}` : ''))
      .join('\n');
    protectedBlocks.push(`\n${indented}\n`);
    return placeholder;
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

  // Clean up whitespace. Leading blank lines are stripped without trimming
  // the first line's own indentation — a document can start with an indented
  // code block (issue #118).
  md = md.replace(/\n{3,}/g, '\n\n');
  md = md.replace(/^(?:[ \t]*\n)+/, '').trimEnd();

  // Append footnote definitions at end
  if (footnoteSection.definitions) {
    md += '\n\n' + footnoteSection.definitions;
  }

  return md;
}

export function markdownToHtml(
  md: string,
  readFormats: MermaidFormat[] = getCurrentMermaidReadFormats(),
): string {
  return markdownToHtmlWithMeta(md, readFormats).html;
}

export interface MarkdownConversionResult {
  html: string;
  /** Format ids found in the document, in order of first occurrence. Empty
   *  when the document contains no mermaid blocks. */
  detectedMermaidFormatIds: string[];
}

export function markdownToHtmlWithMeta(
  md: string,
  readFormats: MermaidFormat[] = getCurrentMermaidReadFormats(),
): MarkdownConversionResult {
  let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Leading YAML front matter -> compact badge node (rendered after escaping so
  // its HTML is not mangled). Keeps the raw block for a verbatim round-trip.
  // Marp-only UI (badge + directive chips) is gated on the doc actually being a
  // Marp deck — `marp:` in the leading front matter. Plain markdown (even with
  // front matter or HTML comments) is left exactly as before: no regression.
  let frontmatterHtml = '';
  const fmMatch = html.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  const isMarpDoc = !!fmMatch && /(?:^|\n)[ \t]*marp[ \t]*:[ \t]*true\b/i.test(fmMatch[1]);
  if (fmMatch && isMarpDoc) {
    frontmatterHtml = buildFrontmatterBadge(fmMatch[1]);
    html = html.slice(fmMatch[0].length);
  }

  // Standalone Marp directive comments (e.g. `<!-- _class: lead -->`) -> chip
  // placeholders, restored after escaping/paragraph-wrapping so the chip HTML
  // is not mangled. `__`-prefixed token is skipped by the paragraph wrapper.
  const directiveChips: string[] = [];
  if (isMarpDoc) {
    html = html.replace(/^[ \t]*<!--([\s\S]*?)-->[ \t]*$/gm, (full, inner) => {
      const raw = String(inner).trim();
      // Leave functional comments (e.g. mermaid attrs) for their own parsers.
      if (/^mermaid-attrs:/i.test(raw)) return full;
      const ph = `__MARP_DIRECTIVE_${directiveChips.length}__`;
      directiveChips.push(
        `<div class="marp-directive" data-marp-directive="${encodeURIComponent(raw)}" contenteditable="false"><span class="md-icon">⚙</span><span class="md-text">${escapeHtml(raw)}</span></div>`
      );
      return ph;
    });
  }

  // Extract page breaks and code blocks before escaping
  html = extractPageBreaks(html);
  const extracted = extractCodeBlocks(html, readFormats);
  html = extracted.html;
  const codeBlocks = extracted.codeBlocks;
  const detectedMermaidFormatIds = extracted.detectedMermaidFormatIds;

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

  // Restore Marp directive chips
  directiveChips.forEach((chip, i) => {
    html = html.replace(`<p>__MARP_DIRECTIVE_${i}__</p>`, chip).replace(`__MARP_DIRECTIVE_${i}__`, chip);
  });

  // Append footnotes section
  html += buildFootnoteSectionHtml(footnoteDefs);

  return { html: (frontmatterHtml + html).trimEnd(), detectedMermaidFormatIds };
}

function buildFrontmatterBadge(raw: string): string {
  const enc = encodeURIComponent(raw);
  const isMarp = /(?:^|\n)\s*marp\s*:/i.test(raw);
  const themeMatch = raw.match(/(?:^|\n)\s*theme\s*:\s*([^\n]+)/i);
  const title = isMarp ? 'Marp presentation' : 'Front matter';
  const meta = themeMatch ? `<span class="mf-meta">theme: ${escapeHtml(themeMatch[1].trim())}</span>` : '';
  return `<div class="marp-frontmatter" data-marp-frontmatter="${enc}" data-marp="${isMarp}" contenteditable="false"><span class="mf-icon">🎬</span><span class="mf-title">${title}</span>${meta}</div>`;
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
