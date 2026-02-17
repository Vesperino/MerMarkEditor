import { escapeHtml, generateSlug } from './html-entities';

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

export function parseMarkdownLists(text: string): string {
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

export function convertMarkdownTables(html: string): string {
  return html.replace(/^\|(.+)\|\n\|([\s\-:|]+)\|\n((?:\|.+\|\n?)*)/gim, (match) => {
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
}

export function convertMarkdownHeaders(html: string): string {
  let result = html;
  result = result.replace(/^###### (.*$)/gim, (_, content) => `<h6 id="${generateSlug(content)}">${content}</h6>`);
  result = result.replace(/^##### (.*$)/gim, (_, content) => `<h5 id="${generateSlug(content)}">${content}</h5>`);
  result = result.replace(/^#### (.*$)/gim, (_, content) => `<h4 id="${generateSlug(content)}">${content}</h4>`);
  result = result.replace(/^### (.*$)/gim, (_, content) => `<h3 id="${generateSlug(content)}">${content}</h3>`);
  result = result.replace(/^## (.*$)/gim, (_, content) => `<h2 id="${generateSlug(content)}">${content}</h2>`);
  result = result.replace(/^# (.*$)/gim, (_, content) => `<h1 id="${generateSlug(content)}">${content}</h1>`);
  return result;
}

export function convertMarkdownFormatting(html: string): string {
  let result = html;
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  result = result.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  return result;
}

export function convertMarkdownLinksAndImages(html: string): string {
  let result = html;
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="editor-image" src="$2" alt="$1" />');
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2">$1</a>');
  return result;
}

export function extractCodeBlocks(md: string): { html: string; codeBlocks: string[] } {
  let html = md;
  const codeBlocks: string[] = [];

  // Mermaid blocks
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

  return { html, codeBlocks };
}

export function restoreCodeBlocks(html: string, codeBlocks: string[]): string {
  let result = html;
  codeBlocks.forEach((block, index) => {
    result = result.replace(`__MERMAID_BLOCK_${index}__`, block);
    result = result.replace(`__CODE_BLOCK_${index}__`, block);
  });
  return result;
}
