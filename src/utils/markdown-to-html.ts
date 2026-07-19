import { escapeHtml, generateSlug } from './html-entities';
import {
  findAllMermaidMatches,
  getCurrentMermaidReadFormats,
  type MermaidFormat,
} from './mermaid-formats';

interface ListItem {
  indent: number;
  content: string;
  type: 'ul' | 'ol' | 'task';
  number?: number;
  checked?: boolean;
  extraContent: string[];
}

function getIndentWidth(whitespace: string): number {
  return Array.from(whitespace).reduce((width, character) => width + (character === '\t' ? 2 : 1), 0);
}

function hasListContinuationIndent(line: string): boolean {
  const leadingWhitespace = line.match(/^\s*/)?.[0] ?? '';
  return getIndentWidth(leadingWhitespace) >= 2;
}

function parseMarkdownListBlock(lines: string[], startIndex: number): { html: string; endIndex: number } {
  const items: ListItem[] = [];
  let idx = startIndex;

  while (idx < lines.length) {
    const line = lines[idx];
    // Task items must be tested before the generic bullet match — they also
    // start with "- ". Accept upper/lower "x" for the checked state.
    const taskMatch = line.match(/^(\s*)- \[([ xX])\] (.*)$/);
    const ulMatch = taskMatch ? null : line.match(/^(\s*)- (.*)$/);
    const olMatch = line.match(/^(\s*)(\d+)\. (.*)$/);

    if (taskMatch) {
      const indent = Math.floor(getIndentWidth(taskMatch[1]) / 2);
      const content = taskMatch[3].trim();
      if (content) {
        items.push({
          indent,
          content,
          type: 'task',
          checked: taskMatch[2].toLowerCase() === 'x',
          extraContent: [],
        });
      }
      idx++;
    } else if (ulMatch) {
      const indent = Math.floor(getIndentWidth(ulMatch[1]) / 2);
      const content = ulMatch[2].trim();
      if (content) {
        items.push({ indent, content, type: 'ul', extraContent: [] });
      }
      idx++;
    } else if (olMatch) {
      const indent = Math.floor(getIndentWidth(olMatch[1]) / 2);
      const content = olMatch[3].trim();
      if (content) {
        items.push({ indent, content, type: 'ol', number: parseInt(olMatch[2]), extraContent: [] });
      }
      idx++;
    } else if (items.length > 0) {
      const trimmed = line.trim();
      if (trimmed === '') {
        // Blank line - look ahead for more list items or indented continuations
        let lookAhead = idx + 1;
        while (lookAhead < lines.length && lines[lookAhead].trim() === '') {
          lookAhead++;
        }
        if (lookAhead < lines.length &&
            (/^\s*- /.test(lines[lookAhead]) || /^\s*\d+\. /.test(lines[lookAhead]) || hasListContinuationIndent(lines[lookAhead]))) {
          idx++;
          continue;
        }
        break;
      } else if (hasListContinuationIndent(line)) {
        // Indented continuation line - belongs to the previous list item
        const lastItem = items[items.length - 1];
        lastItem.extraContent.push(trimmed);
        idx++;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (items.length === 0) {
    return { html: '', endIndex: idx };
  }

  const wrapMissingListLevels = (html: string, type: ListItem['type'], count: number): string => {
    let wrapped = html;
    for (let level = 0; level < count; level++) {
      if (type === 'task') {
        wrapped = `<ul data-type="taskList"><li data-type="taskItem" data-checked="false">${wrapped}</li></ul>`;
      } else {
        wrapped = `<${type}><li>${wrapped}</li></${type}>`;
      }
    }
    return wrapped;
  };

  const buildNestedList = (items: ListItem[], startIdx: number, baseIndent: number): { html: string; endIdx: number } => {
    if (startIdx >= items.length) {
      return { html: '', endIdx: startIdx };
    }

    const firstItem = items[startIdx];
    if (firstItem.indent < baseIndent) {
      return { html: '', endIdx: startIdx };
    }

    const listType = firstItem.type;
    let html = listType === 'task' ? '<ul data-type="taskList">' : `<${listType}>`;
    let i = startIdx;

    while (i < items.length) {
      const item = items[i];

      if (item.indent < baseIndent) break;

      if (item.indent === baseIndent) {
        if (item.type !== listType) break;

        if (item.type === 'task') {
          const checked = item.checked ? 'true' : 'false';
          const checkedAttr = item.checked ? ' checked' : '';
          html += `<li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checkedAttr}></label><p>${item.content}</p>`;
        } else {
          html += `<li><p>${item.content}</p>`;
        }

        // Emit continuation content (code blocks, text paragraphs)
        for (const extra of item.extraContent) {
          if (/^__(?:CODE_BLOCK|MERMAID_BLOCK)_\d+__$/.test(extra)) {
            html += extra;
          } else {
            html += `<p>${extra}</p>`;
          }
        }

        i++;

        if (i < items.length && items[i].indent > baseIndent) {
          const nestedIndent = items[i].indent;
          const nested = buildNestedList(items, i, nestedIndent);
          html += wrapMissingListLevels(nested.html, items[i].type, nestedIndent - baseIndent - 1);
          i = nested.endIdx;
        }

        html += '</li>';
      } else if (item.indent > baseIndent) {
        const nested = buildNestedList(items, i, item.indent);
        html += nested.html;
        i = nested.endIdx;
      }
    }

    html += listType === 'task' ? '</ul>' : `</${listType}>`;
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
    // Bullets, task items ("- [ ]") and ordered items all start a list block;
    // parseMarkdownListBlock tells them apart per line.
    const isUnorderedList = /^\s*- /.test(line);
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
  // Images: ![alt](url) or ![alt](url "title") — .+? supports paths with spaces
  result = result.replace(/!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\s*\)/g, (_match, alt: string, src: string, title: string) => {
    const titleAttr = title ? ` title="${title}"` : '';
    // For local file paths, preserve the original path in data-original-src so it
    // survives blob URL resolution roundtrips (the image-resolver replaces src with
    // a blob URL for display, and data-original-src ensures htmlToMarkdown can
    // recover the real path).
    const isLocalPath = !(/^(https?:|data:|blob:)/i.test(src));
    const originalSrcAttr = isLocalPath ? ` data-original-src="${src}"` : '';
    return `<img class="editor-image" src="${src}" alt="${alt}"${titleAttr}${originalSrcAttr} />`;
  });
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2">$1</a>');
  return result;
}

export function extractPageBreaks(md: string): string {
  // Replace raw HTML page break patterns with a div that survives escaping
  return md.replace(/<div\s+style\s*=\s*["'][^"']*page-break-(?:after|before)\s*:\s*always[^"']*["'][^>]*>\s*<\/div>/gi,
    '__PAGE_BREAK__');
}

function buildMermaidPlaceholder(code: string, attrStr: string | undefined, index: number): { placeholder: string; node: string } {
  const placeholder = `__MERMAID_BLOCK_${index}__`;
  const safeCode = code.trim().replace(/<br\s*\/?>/gi, '__BR__');
  const attrs: string[] = [`data-type="mermaid"`, `data-code="${encodeURIComponent(safeCode)}"`];
  if (attrStr) {
    const pairs = attrStr.split(',').map((p) => p.trim()).filter(Boolean);
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      if (!k || !v) continue;
      if (k === 'userWidth') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n > 0) attrs.push(`data-user-width="${n}"`);
      } else if (k === 'printScale') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n > 0) attrs.push(`data-print-scale="${n}"`);
      } else if (k === 'splitRatio') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n >= 20 && n <= 80) attrs.push(`data-split-ratio="${n}"`);
      }
    }
  }
  return { placeholder, node: `<div ${attrs.join(' ')}></div>` };
}

export interface ExtractedBlocks {
  html: string;
  codeBlocks: string[];
  /** Format ids found in the document, in order of first occurrence. Caller
   *  may persist the first entry to keep round-trip stable. */
  detectedMermaidFormatIds: string[];
}

export function extractCodeBlocks(
  md: string,
  readFormats: MermaidFormat[] = getCurrentMermaidReadFormats(),
): ExtractedBlocks {
  const codeBlocks: string[] = [];
  const detectedIds: string[] = [];

  // Mermaid blocks first. An optional `<!--mermaid-attrs:...-->` HTML comment
  // immediately preceding the fence is written by `htmlToMarkdown` to persist
  // per-diagram node attributes (user-resized width, print scale) — parse it
  // back into `data-*` attributes so the TipTap node restores its state on
  // reload. Multi-format aware: a single document may mix `\`\`\`mermaid`,
  // `:::mermaid`, `~~~mermaid` and the user's custom pair, so iterate over
  // every enabled format and merge matches by position.
  const matches = findAllMermaidMatches(md, readFormats);
  let html = '';
  let cursor = 0;
  for (const m of matches) {
    html += md.slice(cursor, m.start);
    if (!detectedIds.includes(m.formatId)) detectedIds.push(m.formatId);
    const { placeholder, node } = buildMermaidPlaceholder(m.code, m.attrs, codeBlocks.length);
    codeBlocks.push(node);
    html += placeholder;
    cursor = m.end;
  }
  html += md.slice(cursor);

  // Generic fenced code blocks (\`\`\`lang ... \`\`\`). These run after mermaid
  // extraction so a remaining standard fence that happens to also be enabled
  // as a read format never reaches this pass.
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/gi, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    const escapedCode = escapeHtml(code);
    codeBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escapedCode}</code></pre>`);
    return placeholder;
  });

  html = extractIndentedCodeBlocks(html, codeBlocks);

  return { html, codeBlocks, detectedMermaidFormatIds: detectedIds };
}

// Indented code blocks (CommonMark: lines with 4+ spaces / tab). Runs after
// fence extraction so leftover indented fence placeholders are never
// re-captured. A block starts only after a blank line (indented code cannot
// interrupt a paragraph) and never inside a list, where indentation means
// item continuation (issues #33/#95).
const BLOCK_PLACEHOLDER = /^__(?:CODE_BLOCK|MERMAID_BLOCK)_\d+__$/;
const INDENTED_LINE = /^(?: {4}|\t)/;

function isListItemLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s/.test(line);
}

function isInsideListContext(lines: string[], startIdx: number): boolean {
  for (let k = startIdx - 1; k >= 0; k--) {
    const line = lines[k];
    if (line.trim() === '') continue;
    if (isListItemLine(line)) return true;
    // Continuation-shaped line — the list (if any) starts further up.
    if (hasListContinuationIndent(line)) continue;
    return false;
  }
  return false;
}

function extractIndentedCodeBlocks(text: string, codeBlocks: string[]): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isCandidate = INDENTED_LINE.test(line)
      && line.trim() !== ''
      && !BLOCK_PLACEHOLDER.test(line.trim());
    const prevBlankOrStart = out.length === 0 || out[out.length - 1].trim() === '';

    if (isCandidate && prevBlankOrStart && !isInsideListContext(lines, i)) {
      let j = i;
      let lastContent = i;
      while (j < lines.length) {
        const l = lines[j];
        if (l.trim() === '') { j++; continue; }
        if (INDENTED_LINE.test(l) && !BLOCK_PLACEHOLDER.test(l.trim())) {
          lastContent = j;
          j++;
          continue;
        }
        break;
      }

      const content = lines
        .slice(i, lastContent + 1)
        .map(l => l.replace(INDENTED_LINE, ''))
        .join('\n');
      const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
      codeBlocks.push(`<pre data-indented="true"><code class="language-plaintext">${escapeHtml(content)}</code></pre>`);
      out.push(placeholder);
      i = lastContent + 1;
    } else {
      out.push(line);
      i++;
    }
  }

  return out.join('\n');
}

export function restoreCodeBlocks(html: string, codeBlocks: string[]): string {
  let result = html;
  codeBlocks.forEach((block, index) => {
    result = result.replace(`__MERMAID_BLOCK_${index}__`, block);
    result = result.replace(`__CODE_BLOCK_${index}__`, block);
  });
  return result;
}
