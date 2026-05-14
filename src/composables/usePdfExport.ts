import { serializeEditorContent } from '../utils/documentSerializer';
import printCssRaw from '../styles/print.css?raw';
import { DOM_SELECTORS } from '../constants';

export type FontFamily = 'serif' | 'sans' | 'mono';
export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n-of-total';

export interface PdfHeaderFooter {
  enabled: boolean;
  left: string;
  center: string;
  right: string;
}

export interface PdfWatermark {
  enabled: boolean;
  text: string;
  opacity: number;
  rotate: number;
  color: string;
  size: string;
}

export interface PdfSettings {
  fontSize: '8pt' | '9pt' | '10pt' | '11pt' | '12pt';
  margins: 'narrow' | 'normal' | 'wide';
  pageSize: 'A4' | 'Letter' | 'A3';
  fontFamily: FontFamily;
  headingFontFamily: FontFamily;
  accentColor: string;
  tableHeaderBg: string;
  header: PdfHeaderFooter;
  footer: PdfHeaderFooter;
  showPageNumbers: boolean;
  pageNumberFormat: PageNumberFormat;
  startPageNumber: number;
  watermark: PdfWatermark;
}

export const PDF_SETTINGS_STORAGE_KEY = 'mermark.pdfSettings';

export const PDF_SETTINGS_DEFAULTS: PdfSettings = {
  fontSize: '10pt',
  margins: 'normal',
  pageSize: 'A4',
  fontFamily: 'serif',
  headingFontFamily: 'serif',
  accentColor: '#14b8a6',
  tableHeaderBg: '#f1f3f5',
  header: {
    enabled: false,
    left: '{title}',
    center: '',
    right: '{date}',
  },
  footer: {
    enabled: true,
    left: '{path}',
    center: '',
    right: '{page}/{pages}',
  },
  showPageNumbers: true,
  pageNumberFormat: 'n-of-total',
  startPageNumber: 1,
  watermark: {
    enabled: false,
    text: 'DRAFT',
    opacity: 0.08,
    rotate: -30,
    color: '#888888',
    size: '120pt',
  },
};

const MARGIN_MAP: Record<PdfSettings['margins'], { top: string; right: string; bottom: string; left: string }> = {
  narrow: { top: '10mm', right: '10mm', bottom: '14mm', left: '10mm' },
  normal: { top: '18mm', right: '18mm', bottom: '22mm', left: '18mm' },
  wide: { top: '25mm', right: '25mm', bottom: '28mm', left: '25mm' },
};

const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  serif: '"Charter", "Iowan Old Style", "Palatino Linotype", "Cambria", Georgia, "Times New Roman", serif',
  sans: '"Inter", "Segoe UI", "Helvetica Neue", "Arial", "Noto Sans", sans-serif',
  mono: '"Fira Code", "JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, "Liberation Mono", monospace',
};

const PAGE_NUMBER_FORMAT_MAP: Record<PageNumberFormat, string> = {
  n: 'counter(page)',
  'n-of-total': 'counter(page) "/" counter(pages)',
  'page-n-of-total': '"Strona " counter(page) " z " counter(pages)',
};

export interface DocumentMeta {
  title?: string;
  path?: string;
  date?: string;
}

function escapeCssString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a CSS `content:` value for a header/footer cell.
 * Substitutes {title}, {date}, {path}, {page}, {pages}.
 * Page/pages become counter() calls; others become string literals.
 */
export function buildHeaderFooterContent(template: string, meta: DocumentMeta): string {
  if (!template) return '""';
  const date = meta.date ?? new Date().toLocaleDateString();
  const title = meta.title ?? '';
  const path = meta.path ?? '';

  const parts: string[] = [];
  const regex = /\{(title|date|path|page|pages)\}/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(template)) !== null) {
    if (m.index > lastIndex) {
      parts.push(`"${escapeCssString(template.slice(lastIndex, m.index))}"`);
    }
    switch (m[1]) {
      case 'title': parts.push(`"${escapeCssString(title)}"`); break;
      case 'date':  parts.push(`"${escapeCssString(date)}"`); break;
      case 'path':  parts.push(`"${escapeCssString(path)}"`); break;
      case 'page':  parts.push('counter(page)'); break;
      case 'pages': parts.push('counter(pages)'); break;
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < template.length) {
    parts.push(`"${escapeCssString(template.slice(lastIndex))}"`);
  }
  return parts.length ? parts.join(' ') : '""';
}

function buildPageMarginBoxes(settings: PdfSettings, meta: DocumentMeta): string {
  const boxes: string[] = [];
  if (settings.header.enabled) {
    boxes.push(`@top-left { content: ${buildHeaderFooterContent(settings.header.left, meta)}; font-size: 9pt; color: #555; }`);
    boxes.push(`@top-center { content: ${buildHeaderFooterContent(settings.header.center, meta)}; font-size: 9pt; color: #555; }`);
    boxes.push(`@top-right { content: ${buildHeaderFooterContent(settings.header.right, meta)}; font-size: 9pt; color: #555; }`);
  }
  if (settings.footer.enabled) {
    boxes.push(`@bottom-left { content: ${buildHeaderFooterContent(settings.footer.left, meta)}; font-size: 9pt; color: #555; }`);
    boxes.push(`@bottom-center { content: ${buildHeaderFooterContent(settings.footer.center, meta)}; font-size: 9pt; color: #555; }`);
    boxes.push(`@bottom-right { content: ${buildHeaderFooterContent(settings.footer.right, meta)}; font-size: 9pt; color: #555; }`);
  } else if (settings.showPageNumbers) {
    const fmt = PAGE_NUMBER_FORMAT_MAP[settings.pageNumberFormat];
    boxes.push(`@bottom-right { content: ${fmt}; font-size: 9pt; color: #555; }`);
  }
  return boxes.join(' ');
}

function buildWatermarkCss(w: PdfWatermark): string {
  if (!w.enabled || !w.text) return '';
  const text = escapeCssString(w.text);
  return `
.pdf-watermark {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 0;
}
.pdf-watermark::before {
  content: "${text}";
  font-size: ${w.size};
  color: ${w.color};
  opacity: ${w.opacity};
  transform: rotate(${w.rotate}deg);
  white-space: nowrap;
  font-weight: 700;
  letter-spacing: 0.05em;
  font-family: var(--pf-font-body, sans-serif);
}`;
}

export function buildPrintDocument(
  contentHtml: string,
  settings: PdfSettings,
  printCss: string,
  meta: DocumentMeta = {},
): string {
  const m = MARGIN_MAP[settings.margins];
  const bodyFont = FONT_FAMILY_MAP[settings.fontFamily];
  const headingFont = FONT_FAMILY_MAP[settings.headingFontFamily];
  const marginBoxes = buildPageMarginBoxes(settings, meta);
  const watermarkCss = buildWatermarkCss(settings.watermark);
  const watermarkHtml = settings.watermark.enabled && settings.watermark.text
    ? '<div class="pdf-watermark" aria-hidden="true"></div>'
    : '';
  const startPage = Math.max(1, settings.startPageNumber | 0);
  const counterReset = startPage > 1 ? `body { counter-reset: page ${startPage - 1}; }` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page {
  size: ${settings.pageSize};
  margin: ${m.top} ${m.right} ${m.bottom} ${m.left};
  ${marginBoxes}
}
:root {
  --pf-size: ${settings.fontSize};
  --pf-font-body: ${bodyFont};
  --pf-font-heading: ${headingFont};
  --pf-accent: ${settings.accentColor};
  --pf-th-bg: ${settings.tableHeaderBg};
}
${counterReset}
${printCss}
${watermarkCss}
</style>
</head>
<body>${watermarkHtml}${contentHtml}</body>
</html>`;
}

function migrateSettings(parsed: Partial<PdfSettings>): PdfSettings {
  return {
    ...PDF_SETTINGS_DEFAULTS,
    ...parsed,
    header: { ...PDF_SETTINGS_DEFAULTS.header, ...(parsed.header ?? {}) },
    footer: { ...PDF_SETTINGS_DEFAULTS.footer, ...(parsed.footer ?? {}) },
    watermark: { ...PDF_SETTINGS_DEFAULTS.watermark, ...(parsed.watermark ?? {}) },
  };
}

export function loadPdfSettings(): PdfSettings {
  try {
    const raw = localStorage.getItem(PDF_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PdfSettings>;
      return migrateSettings(parsed);
    }
  } catch {
    // ignore corrupt storage
  }
  return { ...PDF_SETTINGS_DEFAULTS };
}

export function savePdfSettings(settings: PdfSettings): void {
  localStorage.setItem(PDF_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

async function _doPrint(editorEl: HTMLElement, settings: PdfSettings, meta: DocumentMeta): Promise<void> {
  savePdfSettings(settings);
  const contentHtml = serializeEditorContent(editorEl);
  const doc = buildPrintDocument(contentHtml, settings, printCssRaw, meta);

  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(doc);
  iframeDoc.close();

  await new Promise<void>(resolve => setTimeout(resolve, 600));

  iframe.contentWindow?.print();

  const cleanup = () => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
    iframe.contentWindow?.removeEventListener('afterprint', cleanup);
  };

  iframe.contentWindow?.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 60_000);
}

export function usePdfExport() {
  async function exportPdf(settings: PdfSettings, meta: DocumentMeta = {}): Promise<void> {
    const editorEl = document.querySelector<HTMLElement>(
      `${DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER} .ProseMirror`,
    ) ?? document.querySelector<HTMLElement>('.ProseMirror');

    if (!editorEl) return;
    return _doPrint(editorEl, settings, meta);
  }

  return { exportPdf };
}
