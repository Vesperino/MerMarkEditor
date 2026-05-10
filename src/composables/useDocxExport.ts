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

type DocxItem = Paragraph | Table;

function buildTextRuns(node: Node): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!text) return [];
    return [new TextRun({ text })];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];

  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const childRuns: TextRun[] = [];
  for (const child of el.childNodes) {
    childRuns.push(...buildTextRuns(child));
  }

  const wrapRuns = (runs: TextRun[], props: Record<string, unknown>): TextRun[] =>
    runs.length > 0
      ? runs.map(r => {
          const t = (r as unknown as { text?: string }).text ?? '';
          return new TextRun({ text: t, ...props } as ConstructorParameters<typeof TextRun>[0]);
        })
      : [new TextRun({ text: el.textContent ?? '', ...props } as ConstructorParameters<typeof TextRun>[0])];

  switch (tag) {
    case 'strong':
    case 'b':
      return wrapRuns(childRuns, { bold: true });
    case 'em':
    case 'i':
      return wrapRuns(childRuns, { italics: true });
    case 'u':
      return wrapRuns(childRuns, { underline: { type: UnderlineType.SINGLE } });
    case 's':
    case 'del':
      return wrapRuns(childRuns, { strike: true });
    case 'code':
      return [new TextRun({
        text: el.textContent ?? '',
        font: 'Courier New',
        size: 18,
        color: 'E11D48',
      })];
    case 'sup':
      return wrapRuns(childRuns, { superScript: true });
    case 'sub':
      return wrapRuns(childRuns, { subScript: true });
    case 'a':
      return wrapRuns(childRuns, { color: '0B56C4', underline: { type: UnderlineType.SINGLE } });
    case 'br':
      return [new TextRun({ text: '', break: 1 })];
    default:
      return childRuns;
  }
}

function buildTable(tableEl: Element): Table {
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
              children: Array.from(cell.childNodes).flatMap(n => buildTextRuns(n)),
              ...(isHeaderRow ? { style: 'Strong' } : {}),
            }),
          ],
          borders: {
            top:    { style: BorderStyle.SINGLE, size: 4, color: 'C0C8D0' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C0C8D0' },
            left:   { style: BorderStyle.SINGLE, size: 4, color: 'C0C8D0' },
            right:  { style: BorderStyle.SINGLE, size: 4, color: 'C0C8D0' },
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

function buildListItems(listEl: Element, ordered: boolean): Paragraph[] {
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
      .flatMap(n => buildTextRuns(n));

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
      items.push(...buildListItems(nested, nested.tagName.toLowerCase() === 'ol'));
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

export function convertElementToDocxItems(el: Element): DocxItem[] {
  const tag = el.tagName.toLowerCase();

  if (HEADING_LEVELS[tag]) {
    return [new Paragraph({
      heading: HEADING_LEVELS[tag],
      children: Array.from(el.childNodes).flatMap(n => buildTextRuns(n)),
    })];
  }

  if (tag === 'p') {
    return [new Paragraph({
      children: Array.from(el.childNodes).flatMap(n => buildTextRuns(n)),
    })];
  }

  if (tag === 'ul') return buildListItems(el, false);
  if (tag === 'ol') return buildListItems(el, true);
  if (tag === 'table') return [buildTable(el)];

  if (tag === 'blockquote') {
    const runs = Array.from(el.childNodes).flatMap(n => buildTextRuns(n));
    return [new Paragraph({
      indent: { left: 720 },
      border: { left: { style: BorderStyle.THICK, size: 12, color: '14B8A6' } },
      children: runs.length > 0 ? runs : [new TextRun({ text: el.textContent ?? '' })],
    })];
  }

  if (tag === 'pre') {
    const code = el.querySelector('code');
    const text = code?.textContent ?? el.textContent ?? '';
    return text.split('\n').map(line =>
      new Paragraph({
        children: [new TextRun({ text: line, font: 'Courier New', size: 18 })],
      }),
    );
  }

  if (tag === 'hr') {
    return [new Paragraph({
      children: [],
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D6DC' } },
    })];
  }

  if (tag === 'figure' && el.classList.contains('mermaid-print-figure')) {
    return [new Paragraph({
      children: [new TextRun({ text: '[Diagram Mermaid — wizualizacja dostępna w MerMark Editor]', italics: true, color: '666666' })],
    })];
  }

  const items: DocxItem[] = [];
  for (const child of el.children) {
    items.push(...convertElementToDocxItems(child));
  }
  return items;
}

function buildDocxDocument(cleanHtml: string): Document {
  const parser = new DOMParser();
  const dom = parser.parseFromString(`<body>${cleanHtml}</body>`, 'text/html');
  const body = dom.body;

  const sections: DocxItem[] = [];
  for (const child of body.children) {
    sections.push(...convertElementToDocxItems(child));
  }

  if (sections.length === 0) {
    sections.push(new Paragraph({ children: [] }));
  }

  return new Document({
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
    const doc = buildDocxDocument(cleanHtml);
    const buffer = await Packer.toBuffer(doc);
    await writeFile(filePath, new Uint8Array(buffer));
  }

  return { exportDocx };
}
