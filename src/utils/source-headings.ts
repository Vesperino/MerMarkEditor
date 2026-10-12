import { markdownLanguage } from '@codemirror/lang-markdown';

/** Use Markdown syntax so fenced code is excluded and Setext headings are included. */
export function sourceHeadings(text: string) {
  const headings: { from: number; level: number; label: string }[] = [];
  markdownLanguage.parser.parse(text).iterate({ enter(node) {
    const match = node.name.match(/^(?:ATX|Setext)Heading([1-6])$/);
    if (!match) return;
    const level = Number(match[1]);
    const raw = text.slice(node.from, node.to);
    const label = node.name.startsWith('ATX')
      ? raw.replace(/^ {0,3}#{1,6}\s*/, '').replace(/\s+#+\s*$/, '')
      : raw.slice(0, raw.lastIndexOf('\n'));
    headings.push({ from: node.from, level, label });
  } });
  return headings;
}
