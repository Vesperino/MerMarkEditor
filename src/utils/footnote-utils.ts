import { escapeHtml, decodeHtmlEntities } from './html-entities';

export interface FootnoteDefinition {
  label: string;
  content: string;
}

/**
 * Extract footnote definitions ([^label]: content) from markdown.
 * Handles single-line and multi-line (4-space indented continuation) definitions.
 * Blank lines terminate a definition unless followed by an indented continuation.
 */
export function extractFootnoteDefinitions(md: string): {
  definitions: FootnoteDefinition[];
  cleanedMd: string;
} {
  const lines = md.split('\n');
  const definitions: FootnoteDefinition[] = [];
  const cleanedLines: string[] = [];
  let currentDef: FootnoteDefinition | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const defMatch = line.match(/^\[\^([^\]]+)\]:\s*(.*)$/);

    if (defMatch) {
      if (currentDef) {
        currentDef.content = currentDef.content.trimEnd();
        definitions.push(currentDef);
      }
      currentDef = { label: defMatch[1], content: defMatch[2] };
    } else if (currentDef && /^    /.test(line)) {
      currentDef.content += '\n' + line.slice(4);
    } else if (currentDef && line.trim() === '') {
      // Blank line: check if definition continues (next non-blank line is indented)
      let nextNonBlank = i + 1;
      while (nextNonBlank < lines.length && lines[nextNonBlank].trim() === '') {
        nextNonBlank++;
      }
      if (nextNonBlank < lines.length && /^    /.test(lines[nextNonBlank])) {
        currentDef.content += '\n';
      } else {
        currentDef.content = currentDef.content.trimEnd();
        definitions.push(currentDef);
        currentDef = null;
        cleanedLines.push(line);
      }
    } else {
      if (currentDef) {
        currentDef.content = currentDef.content.trimEnd();
        definitions.push(currentDef);
        currentDef = null;
      }
      cleanedLines.push(line);
    }
  }

  if (currentDef) {
    currentDef.content = currentDef.content.trimEnd();
    definitions.push(currentDef);
  }

  return { definitions, cleanedMd: cleanedLines.join('\n') };
}

/**
 * Convert [^label] references in text to <sup> HTML elements.
 * Skips references inside <code> tags (uses regex alternation).
 */
export function convertFootnoteRefsToHtml(
  html: string,
  definitions: FootnoteDefinition[]
): string {
  const labelToIndex = new Map<string, number>();
  definitions.forEach((def, i) => labelToIndex.set(def.label, i + 1));

  return html.replace(
    /<code>[\s\S]*?<\/code>|\[\^([^\]]+)\]/g,
    (match, label) => {
      if (label === undefined) return match;
      const index = labelToIndex.get(label);
      if (index === undefined) return match;
      return `<sup class="footnote-ref" data-footnote-ref="${escapeHtml(label)}">${index}</sup>`;
    }
  );
}

/**
 * Build the footnotes section HTML from definitions.
 * Content is stored as escaped markdown (not converted to HTML).
 */
export function buildFootnoteSectionHtml(definitions: FootnoteDefinition[]): string {
  if (definitions.length === 0) return '';

  let html = '<section class="footnotes" data-footnotes>';
  html += '<hr>';
  html += '<ol>';

  for (const def of definitions) {
    const content = escapeHtml(def.content);
    html += `<li data-footnote-id="${escapeHtml(def.label)}"><p>${content}</p></li>`;
  }

  html += '</ol>';
  html += '</section>';
  return html;
}

/**
 * Convert footnote ref <sup> elements back to markdown [^label] syntax.
 */
export function convertHtmlFootnoteRefsToMd(html: string): string {
  return html.replace(
    /<sup[^>]*data-footnote-ref="([^"]*)"[^>]*>\d+<\/sup>/gi,
    '[^$1]'
  );
}

/**
 * Format a single footnote definition as markdown, with 4-space indentation
 * for continuation lines.
 */
function formatDefinitionAsMd(label: string, content: string): string {
  const lines = content.split('\n');
  const first = `[^${label}]: ${lines[0]}`;
  if (lines.length === 1) return first;
  const rest = lines.slice(1).map(l => l === '' ? '' : '    ' + l).join('\n');
  return first + '\n' + rest;
}

/**
 * Extract the footnotes section from HTML and convert to markdown definitions.
 * Handles both data-definitions attribute (from Tiptap getHTML) and
 * <li> DOM structure (from markdownToHtml).
 */
export function extractHtmlFootnoteSection(html: string): {
  html: string;
  definitions: string;
} {
  const match = html.match(/<section[^>]*\sdata-footnotes[^>]*>[\s\S]*?<\/section>/i);
  if (!match) return { html, definitions: '' };

  const sectionHtml = match[0];
  const cleanedHtml = html.replace(sectionHtml, '');

  // Primary: try URL-encoded data-definitions attribute (set by Tiptap renderHTML)
  const dataDefMatch = sectionHtml.match(/data-definitions="([^"]*)"/);
  if (dataDefMatch) {
    try {
      const json = decodeURIComponent(dataDefMatch[1]);
      const defs: FootnoteDefinition[] = JSON.parse(json);
      const md = defs.map(d => formatDefinitionAsMd(d.label, d.content)).join('\n');
      return { html: cleanedHtml, definitions: md };
    } catch { /* fall through to HTML parsing */ }
  }

  // Fallback: parse from <li data-footnote-id> elements
  const liRegex = /<li[^>]*data-footnote-id="([^"]*)"[^>]*>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi;
  const defs: string[] = [];
  let liMatch;
  while ((liMatch = liRegex.exec(sectionHtml)) !== null) {
    const label = liMatch[1];
    let content = liMatch[2];
    content = content.replace(/<[^>]+>/g, '');
    content = decodeHtmlEntities(content);
    defs.push(formatDefinitionAsMd(label, content));
  }

  return { html: cleanedHtml, definitions: defs.join('\n') };
}
