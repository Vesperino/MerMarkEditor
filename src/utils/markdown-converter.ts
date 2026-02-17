const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&rarr;': '→',
  '&larr;': '←',
  '&uarr;': '↑',
  '&darr;': '↓',
  '&harr;': '↔',
  '&mdash;': '—',
  '&ndash;': '–',
  '&bull;': '•',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

export function decodeHtmlEntities(text: string): string {
  let result = text;

  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.split(entity).join(char);
  }

  // Hex entities: &#x1F600;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  );

  // Decimal entities: &#128512;
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCodePoint(parseInt(dec, 10))
  );

  return result;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function convertInlineToMarkdown(html: string): string {
  let result = html;

  // Protect inline code first to preserve content like <T>, <TId>
  const inlineCodeBlocks: string[] = [];
  result = result.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
    const decoded = decodeHtmlEntities(content);
    const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
    inlineCodeBlocks.push(`\`${decoded}\``);
    return placeholder;
  });

  // Convert links
  result = result.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, '').trim();
    return `[${cleanText}](${href})`;
  });

  // Convert formatting
  result = result.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
  result = result.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
  result = result.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
  result = result.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
  result = result.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');

  // Remove remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');
  result = decodeHtmlEntities(result);

  // Restore inline code blocks
  inlineCodeBlocks.forEach((code, index) => {
    result = result.replace(`__INLINE_CODE_${index}__`, code);
  });

  return result.trim();
}

function extractMermaidCode(match: string): string | null {
  // Match double-quoted values first (our output format), then single-quoted
  let codeMatch = match.match(/data-code="([^"]*)"/);
  if (!codeMatch) {
    codeMatch = match.match(/data-code='([^']*)'/);
  }

  if (codeMatch) {
    let code = decodeURIComponent(codeMatch[1]);
    code = code.replace(/__BR__/g, '<br/>');
    return code;
  }
  return null;
}

function parseHtmlList(html: string, indent = 0, isOrdered = false, startIndex = 1): string {
  let result = '';
  const indentStr = '  '.repeat(indent);
  let remaining = html;
  let itemIndex = startIndex;

  while (remaining.length > 0) {
    const liStartMatch = remaining.match(/^[\s\S]*?<li([^>]*)>/i);
    if (!liStartMatch) break;

    const liStartIndex = remaining.indexOf(liStartMatch[0]);
    remaining = remaining.slice(liStartIndex + liStartMatch[0].length);

    let depth = 1;
    let liContent = '';
    let pos = 0;

    while (depth > 0 && pos < remaining.length) {
      const nextLiOpen = remaining.indexOf('<li', pos);
      const nextLiClose = remaining.indexOf('</li>', pos);

      if (nextLiClose === -1) break;

      if (nextLiOpen !== -1 && nextLiOpen < nextLiClose) {
        liContent += remaining.slice(pos, nextLiOpen + 3);
        pos = nextLiOpen + 3;
        const endOfTag = remaining.indexOf('>', pos);
        if (endOfTag !== -1) {
          liContent += remaining.slice(pos, endOfTag + 1);
          pos = endOfTag + 1;
        }
        depth++;
      } else {
        if (depth > 1) {
          // Include </li> for nested elements to preserve proper HTML structure
          liContent += remaining.slice(pos, nextLiClose + 5);
        } else {
          liContent += remaining.slice(pos, nextLiClose);
        }
        pos = nextLiClose + 5;
        depth--;
      }
    }

    remaining = remaining.slice(pos);

    const isTaskItem = /data-type=["']taskItem["']/i.test(liStartMatch[1] || '');
    const isChecked = /data-checked=["']true["']/i.test(liStartMatch[1] || '');

    let textContent = liContent;
    let nestedListHtml = '';

    const nestedUlMatch = liContent.match(/<ul[^>]*>([\s\S]*)<\/ul>\s*$/i);
    const nestedOlMatch = liContent.match(/<ol[^>]*>([\s\S]*)<\/ol>\s*$/i);

    if (nestedUlMatch) {
      textContent = liContent.slice(0, liContent.indexOf('<ul'));
      nestedListHtml = nestedUlMatch[0];
    } else if (nestedOlMatch) {
      textContent = liContent.slice(0, liContent.indexOf('<ol'));
      nestedListHtml = nestedOlMatch[0];
    }

    textContent = textContent
      .replace(/<label[^>]*>[\s\S]*?<\/label>/gi, '')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1');
    const text = convertInlineToMarkdown(textContent);

    let marker: string;
    if (isTaskItem) {
      marker = `- [${isChecked ? 'x' : ' '}]`;
    } else if (isOrdered) {
      marker = `${itemIndex}.`;
      itemIndex++;
    } else {
      marker = '-';
    }

    if (text.trim()) {
      result += `${indentStr}${marker} ${text}\n`;
    }

    if (nestedListHtml) {
      const isNestedOrdered = nestedListHtml.startsWith('<ol');
      const nestedContent = nestedListHtml.replace(/^<[uo]l[^>]*>([\s\S]*)<\/[uo]l>$/i, '$1');
      result += parseHtmlList(nestedContent, indent + 1, isNestedOrdered);
    }
  }

  return result;
}

function findMatchingCloseTag(html: string, openTag: string, closeTag: string, startPos: number): number {
  let depth = 1;
  let pos = startPos;

  while (depth > 0 && pos < html.length) {
    const nextOpen = html.indexOf(openTag, pos);
    const nextClose = html.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }

  return -1;
}

function processHtmlLists(html: string): string {
  let result = html;

  // Process unordered lists with proper nesting support
  let ulMatch;
  const ulRegex = /<ul(?![^>]*data-type=["']taskList["'])[^>]*>/gi;

  while ((ulMatch = ulRegex.exec(result)) !== null) {
    const startPos = ulMatch.index;
    const contentStart = startPos + ulMatch[0].length;
    const closePos = findMatchingCloseTag(result, '<ul', '</ul>', contentStart);

    if (closePos !== -1) {
      const content = result.slice(contentStart, closePos);
      const replacement = '\n' + parseHtmlList(content, 0, false);
      result = result.slice(0, startPos) + replacement + result.slice(closePos + 5); // </ul> = 5 chars
      ulRegex.lastIndex = 0;
    }
  }

  // Process ordered lists with proper nesting support
  let olMatch;
  const olRegex = /<ol[^>]*>/gi;

  while ((olMatch = olRegex.exec(result)) !== null) {
    const startPos = olMatch.index;
    const contentStart = startPos + olMatch[0].length;
    const closePos = findMatchingCloseTag(result, '<ol', '</ol>', contentStart);

    if (closePos !== -1) {
      const content = result.slice(contentStart, closePos);
      const replacement = '\n' + parseHtmlList(content, 0, true);
      result = result.slice(0, startPos) + replacement + result.slice(closePos + 5); // </ol> = 5 chars
      olRegex.lastIndex = 0;
    }
  }

  return result;
}

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
        // Convert links to markdown BEFORE stripping other tags
        cellContent = cellContent.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
          const cleanText = text.replace(/<[^>]+>/g, '').trim();
          return `[${cleanText}](${href})`;
        });
        // Now strip remaining HTML tags
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
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n# ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${convertInlineToMarkdown(content)}\n\n`);

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

interface ListItem {
  indent: number;
  content: string;
  type: 'ul' | 'ol';
  number?: number;
}

function parseMarkdownListBlock(lines: string[], startIndex: number): { html: string; endIndex: number } {
  const items: ListItem[] = [];
  let idx = startIndex;

  while (idx < lines.length) {
    const line = lines[idx];
    const ulMatch = line.match(/^(\s*)- (.*)$/);
    const olMatch = line.match(/^(\s*)(\d+)\. (.*)$/);

    if (ulMatch) {
      const indent = Math.floor(ulMatch[1].length / 2);
      const content = ulMatch[2].trim();
      if (content) {
        items.push({ indent, content, type: 'ul' });
      }
      idx++;
    } else if (olMatch) {
      const indent = Math.floor(olMatch[1].length / 2);
      const content = olMatch[3].trim();
      if (content) {
        items.push({ indent, content, type: 'ol', number: parseInt(olMatch[2]) });
      }
      idx++;
    } else {
      break;
    }
  }

  if (items.length === 0) {
    return { html: '', endIndex: idx };
  }

  const buildNestedList = (items: ListItem[], startIdx: number, baseIndent: number): { html: string; endIdx: number } => {
    if (startIdx >= items.length) {
      return { html: '', endIdx: startIdx };
    }

    const firstItem = items[startIdx];
    if (firstItem.indent < baseIndent) {
      return { html: '', endIdx: startIdx };
    }

    const listType = firstItem.type;
    let html = `<${listType}>`;
    let i = startIdx;

    while (i < items.length) {
      const item = items[i];

      if (item.indent < baseIndent) break;

      if (item.indent === baseIndent) {
        if (item.type !== listType) break;

        html += `<li><p>${item.content}</p>`;
        i++;

        if (i < items.length && items[i].indent > baseIndent) {
          const nested = buildNestedList(items, i, items[i].indent);
          html += nested.html;
          i = nested.endIdx;
        }

        html += '</li>';
      } else if (item.indent > baseIndent) {
        const nested = buildNestedList(items, i, item.indent);
        html += nested.html;
        i = nested.endIdx;
      }
    }

    html += `</${listType}>`;
    return { html, endIdx: i };
  };

  let fullHtml = '';
  let processedIdx = 0;
  while (processedIdx < items.length) {
    const result = buildNestedList(items, processedIdx, items[processedIdx].indent);
    fullHtml += result.html;
    processedIdx = result.endIdx;
  }

  return { html: fullHtml, endIndex: idx };
}

function parseMarkdownLists(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isUnorderedList = /^\s*- /.test(line) && !/^\s*- \[[ x]\]/.test(line);
    const isOrderedList = /^\s*\d+\. /.test(line);

    if (isUnorderedList || isOrderedList) {
      const { html: listHtml, endIndex } = parseMarkdownListBlock(lines, i);
      result.push(listHtml);
      i = endIndex;
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

export function markdownToHtml(md: string): string {
  let html = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const codeBlocks: string[] = [];

  // Mermaid blocks - convert <br> to placeholder
  html = html.replace(/```mermaid\n([\s\S]*?)```/gi, (_, code) => {
    const placeholder = `__MERMAID_BLOCK_${codeBlocks.length}__`;
    const safeCode = code.trim().replace(/<br\s*\/?>/gi, '__BR__');
    codeBlocks.push(`<div data-type="mermaid" data-code="${encodeURIComponent(safeCode)}"></div>`);
    return placeholder;
  });

  // Code blocks
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/gi, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const escapedCode = escapeHtml(code);
    codeBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escapedCode}</code></pre>`);
    return placeholder;
  });

  html = escapeHtml(html);

  // Tables
  html = html.replace(/^\|(.+)\|\n\|([\s\-:|]+)\|\n((?:\|.+\|\n?)*)/gim, (match) => {
    const lines = match.trim().split('\n');
    if (lines.length < 2) return match;

    let result = '<table class="editor-table">';

    const headerCells = lines[0].split('|').slice(1, -1);
    result += '<thead><tr>';
    headerCells.forEach(cell => {
      result += `<th><p>${cell.trim()}</p></th>`;
    });
    result += '</tr></thead>';

    if (lines.length > 2) {
      result += '<tbody>';
      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split('|').slice(1, -1);
        if (cells.length > 0) {
          result += '<tr>';
          cells.forEach(cell => {
            result += `<td><p>${cell.trim()}</p></td>`;
          });
          result += '</tr>';
        }
      }
      result += '</tbody>';
    }

    result += '</table>';
    return result;
  });

  // Task lists
  html = html.replace(/^- \[([ x])\] (.*)$/gim, (_, checked, text) => {
    const isChecked = checked === 'x';
    return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? 'checked' : ''}></label><p>${text}</p></li>`;
  });

  html = html.replace(/(<li data-type="taskItem"[^>]*>[\s\S]*?<\/li>\n?)+/g, '<ul data-type="taskList">$&</ul>');

  // Headers
  html = html.replace(/^###### (.*$)/gim, (_, content) => `<h6 id="${generateSlug(content)}">${content}</h6>`);
  html = html.replace(/^##### (.*$)/gim, (_, content) => `<h5 id="${generateSlug(content)}">${content}</h5>`);
  html = html.replace(/^#### (.*$)/gim, (_, content) => `<h4 id="${generateSlug(content)}">${content}</h4>`);
  html = html.replace(/^### (.*$)/gim, (_, content) => `<h3 id="${generateSlug(content)}">${content}</h3>`);
  html = html.replace(/^## (.*$)/gim, (_, content) => `<h2 id="${generateSlug(content)}">${content}</h2>`);
  html = html.replace(/^# (.*$)/gim, (_, content) => `<h1 id="${generateSlug(content)}">${content}</h1>`);

  // Formatting
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="editor-image" src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr />');

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gim, '<blockquote><p>$1</p></blockquote>');

  html = parseMarkdownLists(html);

  // Paragraphs - exclude only block-level elements and placeholders, not inline elements
  html = html.replace(/^(?!<[huplodtb]|<\/|<hr|<img|__)(.+)$/gim, '<p>$1</p>');
  html = html.replace(/<p>\s*<\/p>/g, '');

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    html = html.replace(`__MERMAID_BLOCK_${index}__`, block);
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });

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
  // Normalize to LF first, then apply desired line ending
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (lineEnding === '\n') return normalized;
  return normalized.replace(/\n/g, lineEnding);
}
