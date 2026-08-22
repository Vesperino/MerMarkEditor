export interface MarkdownTocItem {
  level: number;
  text: string;
  offset: number;
}

const cleanHeadingText = (text: string): string => text
  .replace(/\s+#+\s*$/, '')
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_~`]/g, '')
  .trim();

/** Fast, allocation-bounded heading scan used by the large-file TOC worker. */
export function extractMarkdownToc(markdown: string): MarkdownTocItem[] {
  const items: MarkdownTocItem[] = [];
  let offset = 0;
  let previousLine = '';
  let previousOffset = 0;
  let fenceChar = '';
  let fenceLength = 0;
  let inFrontmatter = markdown.startsWith('---\n') || markdown.startsWith('---\r\n');

  for (const line of markdown.split('\n')) {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;

    if (inFrontmatter) {
      if (offset > 0 && /^(---|\.\.\.)\s*$/.test(normalized)) inFrontmatter = false;
      previousLine = '';
      previousOffset = offset;
      offset += line.length + 1;
      continue;
    }

    const fence = normalized.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
      previousLine = '';
      previousOffset = offset;
      offset += line.length + 1;
      continue;
    }

    if (!fenceChar) {
      const atx = normalized.match(/^(#{1,6})[ \t]+(.+?)\s*$/);
      if (atx) {
        const text = cleanHeadingText(atx[2]);
        if (text) items.push({ level: atx[1].length, text, offset });
      } else if (previousLine.trim() && /^\s*(=+|-+)\s*$/.test(normalized)) {
        const text = cleanHeadingText(previousLine);
        if (text) items.push({ level: normalized.includes('=') ? 1 : 2, text, offset: previousOffset });
      }
    }

    previousLine = normalized;
    previousOffset = offset;
    offset += line.length + 1;
  }

  return items;
}
