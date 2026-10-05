import { useDocumentStyle } from './useDocumentStyle';
import { resolveDocumentStyle, type ResolvedDocumentStyle } from '../styles/document-themes';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  UnderlineType,
  BorderStyle,
} from 'docx';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { serializeEditorContent } from '../utils/documentSerializer';
import { DOM_SELECTORS } from '../constants';
import { decodeMath, mathMarkdown } from '../utils/math';

type DocxItem = Paragraph | Table;

type OriginalRunOptions = Exclude<ConstructorParameters<typeof TextRun>[0], string>;
type RunOptions = { -readonly [K in keyof OriginalRunOptions]: OriginalRunOptions[K] };
const wordColor = (color: string) => color.replace('#', '').toUpperCase();
function wordFont(stack: string): string {
  const first = stack.split(',')[0].trim().replace(/['"]/g, '');
  return first.startsWith('-') || first === 'BlinkMacSystemFont' ? 'Arial' : first;
}
function buildTextRuns(node: Node, style: ResolvedDocumentStyle, inherited: RunOptions = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [new TextRun({ ...inherited, text: node.textContent })] : [];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  if (el.matches('[data-type="katex-inline"], [data-type="katex-block"]')) {
    return [new TextRun({ ...inherited, text: mathMarkdown(decodeMath(el.getAttribute('data-formula') ?? ''), decodeMath(el.getAttribute('data-math-source') ?? ''), el.getAttribute('data-type') === 'katex-block'), font: 'Cambria Math' })];
  }
  const props: RunOptions = { ...inherited };
  switch (el.tagName.toLowerCase()) {
    case 'strong': case 'b': props.bold = true; break;
    case 'em': case 'i': props.italics = true; break;
    case 'u': props.underline = { type: UnderlineType.SINGLE }; break;
    case 's': case 'del': props.strike = true; break;
    case 'code': props.font = wordFont(style.codeFontFamily); props.size = Math.round(style.fontSize * .875 * 1.5); break;
    case 'sup': props.superScript = true; break;
    case 'sub': props.subScript = true; break;
    case 'a': props.color = wordColor(style.palette.link); props.underline = { type: UnderlineType.SINGLE }; break;
    case 'br': return [new TextRun({ ...props, text: '', break: 1 })];
  }
  return Array.from(el.childNodes).flatMap(child => buildTextRuns(child, style, props));
}

function buildTable(tableEl: Element, style: ResolvedDocumentStyle): Table {
  const rows: TableRow[] = [];
  const trEls = Array.from(tableEl.querySelectorAll('tr'));
  for (const tr of trEls) {
    const cells: TableCell[] = [];
    const cellEls = Array.from(tr.querySelectorAll('th, td'));
    const isHeaderRow = cellEls.some(c => c.tagName.toLowerCase() === 'th');
    for (const cell of cellEls) {
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              children: Array.from(cell.childNodes).flatMap(n => buildTextRuns(n, style)),
              ...(isHeaderRow ? { style: 'Strong' } : {}),
            }),
          ],
          shading: { fill: wordColor(isHeaderRow ? style.palette.table : style.palette.background) },
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) },
            left:   { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) },
            right:  { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) },
          },
        }),
      );
    }
    if (cells.length > 0) {
      rows.push(new TableRow({ children: cells }));
    }
  }
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildListItems(listEl: Element, ordered: boolean, style: ResolvedDocumentStyle): Paragraph[] {
  const items: Paragraph[] = [];
  let counter = 1;
  for (const li of listEl.querySelectorAll(':scope > li')) {
    const runs = Array.from(li.childNodes)
      .filter(n => {
        if (n.nodeType === Node.TEXT_NODE) return true;
        if (n.nodeType === Node.ELEMENT_NODE) {
          const tag = (n as Element).tagName.toLowerCase();
          return !['ul', 'ol'].includes(tag);
        }
        return false;
      })
      .flatMap(n => buildTextRuns(n, style));

    if (ordered) {
      items.push(new Paragraph({
        children: [new TextRun({ text: `${counter}. ` }), ...runs],
      }));
      counter++;
    } else {
      items.push(new Paragraph({
        bullet: { level: 0 },
        children: runs,
      }));
    }

    const nested = li.querySelector('ul, ol');
    if (nested) {
      items.push(...buildListItems(nested, nested.tagName.toLowerCase() === 'ol', style));
    }
  }
  return items;
}

const HEADING_LEVELS: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  h1: HeadingLevel.HEADING_1,
  h2: HeadingLevel.HEADING_2,
  h3: HeadingLevel.HEADING_3,
  h4: HeadingLevel.HEADING_4,
  h5: HeadingLevel.HEADING_5,
  h6: HeadingLevel.HEADING_6,
};

export function convertElementToDocxItems(el: Element, style: ResolvedDocumentStyle = resolveDocumentStyle()): DocxItem[] {
  if (el.matches('[data-type="katex-block"], [data-type="katex-inline"]')) {
    return [new Paragraph({ children: buildTextRuns(el, style) })];
  }
  const tag = el.tagName.toLowerCase();

  if (HEADING_LEVELS[tag]) {
    return [new Paragraph({
      heading: HEADING_LEVELS[tag],
      children: Array.from(el.childNodes).flatMap(n => buildTextRuns(n, style)),
    })];
  }

  if (tag === 'p') {
    return [new Paragraph({
      children: Array.from(el.childNodes).flatMap(n => buildTextRuns(n, style)),
    })];
  }

  if (tag === 'ul') return buildListItems(el, false, style);
  if (tag === 'ol') return buildListItems(el, true, style);
  if (tag === 'table') return [buildTable(el, style)];

  if (tag === 'blockquote') {
    const runs = Array.from(el.childNodes).flatMap(n => buildTextRuns(n, style));
    return [new Paragraph({
      indent: { left: 720 },
      style: 'DocumentQuote',
      border: { left: { style: BorderStyle.THICK, size: 12, color: wordColor(style.palette.border) } },
      children: runs.length > 0 ? runs : [new TextRun({ text: el.textContent ?? '' })],
    })];
  }

  if (tag === 'pre') {
    const code = el.querySelector('code');
    const text = code?.textContent ?? el.textContent ?? '';
    return text.split('\n').map(line =>
      new Paragraph({
        spacing: { after: 0, line: 360 },
        shading: { fill: style.codeDark ? '0F172A' : 'F8FAFC' },
        children: [new TextRun({ text: line, font: wordFont(style.codeFontFamily), size: Math.round(style.fontSize * .875 * 1.5), color: style.codeDark ? 'E2E8F0' : '1E293B' })],
      }),
    );
  }

  if (tag === 'hr') {
    return [new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) } },
    })];
  }

  if (tag === 'figure' && el.classList.contains('mermaid-print-figure')) {
    return [new Paragraph({
      children: [new TextRun({ text: '[Diagram Mermaid — wizualizacja dostępna w MerMark Editor]', italics: true, color: '666666' })],
    })];
  }

  const items: DocxItem[] = [];
  for (const child of el.children) {
    items.push(...convertElementToDocxItems(child, style));
  }
  return items;
}

export function buildDocxDocument(cleanHtml: string, style: ResolvedDocumentStyle = resolveDocumentStyle()): Document {
  const parser = new DOMParser();
  const dom = parser.parseFromString(`<body>${cleanHtml}</body>`, 'text/html');
  const body = dom.body;

  const sections: DocxItem[] = [];
  for (const child of body.children) {
    sections.push(...convertElementToDocxItems(child, style));
  }

  if (sections.length === 0) {
    sections.push(new Paragraph({ children: [] }));
  }

  const headingStyles = Object.fromEntries(style.headings.map((heading, i) => [`heading${i + 1}`, {
    run: { font: wordFont(style.fontFamily), size: Math.round(style.fontSize * heading.size * 1.5), bold: heading.weight >= 600, italics: heading.italic ?? false, smallCaps: heading.caps === 'small-caps' ? true : undefined, allCaps: heading.caps === 'uppercase' ? true : undefined, color: wordColor(heading.muted ? style.palette.muted : style.palette.text) },
    paragraph: { spacing: { before: Math.round(style.fontSize * (heading.spaceBefore ?? style.headingSpaceBefore) * 15), after: Math.round(style.fontSize * (heading.spaceAfter ?? style.headingSpaceAfter) * 15), line: Math.round((heading.lineHeight ?? style.headingLineHeight) * 240) }, keepNext: true, ...(heading.divider ? { border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: wordColor(style.palette.border) } } } : {}) },
  }]));
  return new Document({
    background: { color: wordColor(style.palette.background) },
    styles: {
      default: {
        document: { run: { font: wordFont(style.fontFamily), size: Math.round(style.fontSize * 1.5), color: wordColor(style.palette.text) }, paragraph: { spacing: { after: Math.round(style.fontSize * style.paragraphSpacing * 15), line: Math.round(style.lineHeight * 240) } } },
        ...headingStyles,
      },
      paragraphStyles: [
        { id: 'DocumentQuote', name: 'Document Quote', basedOn: 'Normal', run: { color: wordColor(style.palette.muted), italics: style.quoteItalic ?? false } },
      ],
    },
    sections: [{ children: sections }],
  });
}

export function useDocxExport() {
  async function exportDocx(): Promise<void> {
    const editorEl =
      document.querySelector<HTMLElement>(
        `${DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER} .ProseMirror`,
      ) ?? document.querySelector<HTMLElement>('.ProseMirror');

    if (!editorEl) return;

    const filePath = await save({
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
      defaultPath: 'document.docx',
    });

    if (!filePath) return;

    const cleanHtml = serializeEditorContent(editorEl);
    const doc = buildDocxDocument(cleanHtml, useDocumentStyle('light').value);
    const blob = await Packer.toBlob(doc);
    const arrayBuffer = await blob.arrayBuffer();
    await writeFile(filePath, new Uint8Array(arrayBuffer));
  }

  return { exportDocx };
}
