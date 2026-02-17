import { decodeHtmlEntities } from './html-entities';

export function convertInlineToMarkdown(html: string): string {
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

export function extractMermaidCode(match: string): string | null {
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

export function parseHtmlList(html: string, indent = 0, isOrdered = false, startIndex = 1): string {
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

export function processHtmlLists(html: string): string {
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
      result = result.slice(0, startPos) + replacement + result.slice(closePos + 5);
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
      result = result.slice(0, startPos) + replacement + result.slice(closePos + 5);
      olRegex.lastIndex = 0;
    }
  }

  return result;
}
