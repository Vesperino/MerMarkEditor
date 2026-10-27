import { useDocumentStyle } from './useDocumentStyle';
import { documentPrintCss, loadPrintFonts } from '../styles/document-themes/print';
import type { ResolvedDocumentStyle } from '../styles/document-themes';
import { invoke } from '@tauri-apps/api/core';
import { serializeEditorContent } from '../utils/documentSerializer';
import printCssRaw from '../styles/print.css?raw';
import { mathPrintCss } from '../utils/math-print';
import { renderMathNodes } from '../utils/math';
import { DOM_SELECTORS } from '../constants';
import { t } from '../i18n';
import { paginate, serializePaged, type MarginBox } from '../utils/paged-media';

export type FontCategory = 'serif' | 'sans' | 'mono';
export type PageNumberFormat = 'n' | 'n-of-total' | 'page-n-of-total';

export interface SystemFont {
  id: string;
  label: string;
  stack: string;
  category: FontCategory;
}

export const SYSTEM_FONTS: SystemFont[] = [
  // Serif
  { id: 'charter',     label: 'Charter',         category: 'serif', stack: '"Charter", "Iowan Old Style", "Palatino Linotype", "Cambria", Georgia, "Times New Roman", serif' },
  { id: 'georgia',     label: 'Georgia',         category: 'serif', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'cambria',     label: 'Cambria',         category: 'serif', stack: '"Cambria", Georgia, "Times New Roman", serif' },
  { id: 'times',       label: 'Times New Roman', category: 'serif', stack: '"Times New Roman", "Liberation Serif", serif' },
  { id: 'palatino',    label: 'Palatino',        category: 'serif', stack: '"Palatino Linotype", "Book Antiqua", Palatino, "URW Palladio L", serif' },
  { id: 'garamond',    label: 'Garamond',        category: 'serif', stack: '"EB Garamond", Garamond, "Apple Garamond", serif' },
  { id: 'baskerville', label: 'Baskerville',     category: 'serif', stack: '"Baskerville", "Libre Baskerville", "Times New Roman", serif' },
  // Sans
  { id: 'inter',     label: 'Inter',         category: 'sans', stack: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { id: 'segoe',     label: 'Segoe UI',      category: 'sans', stack: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' },
  { id: 'arial',     label: 'Arial',         category: 'sans', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'helvetica', label: 'Helvetica',     category: 'sans', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: 'verdana',   label: 'Verdana',       category: 'sans', stack: 'Verdana, "DejaVu Sans", sans-serif' },
  { id: 'tahoma',    label: 'Tahoma',        category: 'sans', stack: 'Tahoma, "DejaVu Sans", sans-serif' },
  { id: 'calibri',   label: 'Calibri',       category: 'sans', stack: 'Calibri, "Carlito", "Segoe UI", sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS',  category: 'sans', stack: '"Trebuchet MS", "Lucida Sans Unicode", sans-serif' },
  // Mono
  { id: 'fira-code',  label: 'Fira Code',       category: 'mono', stack: '"Fira Code", "JetBrains Mono", Consolas, "Liberation Mono", monospace' },
  { id: 'jetbrains',  label: 'JetBrains Mono',  category: 'mono', stack: '"JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", monospace' },
  { id: 'consolas',   label: 'Consolas',        category: 'mono', stack: 'Consolas, "Liberation Mono", "Courier New", monospace' },
  { id: 'courier',    label: 'Courier New',     category: 'mono', stack: '"Courier New", "Liberation Mono", monospace' },
  { id: 'cascadia',   label: 'Cascadia Code',   category: 'mono', stack: '"Cascadia Code", Consolas, monospace' },
  { id: 'sf-mono',    label: 'SF Mono',         category: 'mono', stack: '"SF Mono", Menlo, Monaco, Consolas, monospace' },
];

const FONT_LEGACY_MIGRATION: Record<string, string> = {
  serif: 'charter',
  sans: 'inter',
  mono: 'fira-code',
};

export function getFontStack(id: string): string {
  return SYSTEM_FONTS.find(f => f.id === id)?.stack
    ?? SYSTEM_FONTS[0].stack;
}

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

export type MarginPreset = 'narrow' | 'normal' | 'wide' | 'custom';

export interface CustomMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PdfSettings {
  fontSize: `${number}pt`;
  typographySource: 'current-editor' | 'custom' | 'legacy';
  documentStyleSnapshot?: ResolvedDocumentStyle;
  margins: MarginPreset;
  customMarginMm: number;
  customMargins: CustomMargins;
  pageSize: 'A4' | 'Letter' | 'A3';
  fontFamily: string;
  headingFontFamily: string;
  accentColor: string;
  tableHeaderBg: string;
  header: PdfHeaderFooter;
  footer: PdfHeaderFooter;
  showPageNumbers: boolean;
  pageNumberFormat: PageNumberFormat;
  startPageNumber: number;
  watermark: PdfWatermark;
  showToc: boolean;
  tocDepth: 1 | 2 | 3 | 4 | 5 | 6;
  tocPageBreak: boolean;
}

export const PDF_SETTINGS_STORAGE_KEY = 'mermark.pdfSettings';

export const PDF_SETTINGS_DEFAULTS: PdfSettings = {
  typographySource: 'current-editor',
  fontSize: '10pt',
  margins: 'normal',
  customMarginMm: 18,
  customMargins: { top: 18, right: 18, bottom: 22, left: 18 },
  pageSize: 'A4',
  fontFamily: 'charter',
  headingFontFamily: 'charter',
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
  showToc: false,
  tocDepth: 6,
  tocPageBreak: false,
};

interface Margins { top: string; right: string; bottom: string; left: string; }

function clampMm(v: number): string {
  return `${Math.max(3, Math.min(60, v | 0))}mm`;
}

function resolveMargins(settings: PdfSettings): Margins {
  if (settings.margins === 'custom') {
    const c = settings.customMargins;
    return {
      top: clampMm(c.top),
      right: clampMm(c.right),
      bottom: clampMm(c.bottom),
      left: clampMm(c.left),
    };
  }
  switch (settings.margins) {
    case 'narrow': return { top: '10mm', right: '10mm', bottom: '14mm', left: '10mm' };
    case 'wide':   return { top: '25mm', right: '25mm', bottom: '28mm', left: '25mm' };
    default:       return { top: '18mm', right: '18mm', bottom: '22mm', left: '18mm' };
  }
}

function pageNumberTemplate(format: PageNumberFormat): string {
  if (format === 'n') return '{page}';
  if (format === 'n-of-total') return '{page}/{pages}';
  return t.value.pdfPageNumberFormatPageNOfTotalLive(1, 2).replace('1', '{page}').replace('2', '{pages}');
}

export interface DocumentMeta {
  title?: string;
  path?: string;
  date?: string;
}

function escapeCssString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a CSS `content:` value for an @page margin box.
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

function resolveTemplate(template: string, meta: DocumentMeta, page: number, pages: number): string {
  if (!template) return '';
  const date = meta.date ?? new Date().toLocaleDateString();
  return template
    .replace(/\{title\}/g, meta.title ?? '')
    .replace(/\{date\}/g, date)
    .replace(/\{path\}/g, meta.path ?? '')
    .replace(/\{page\}/g, String(page))
    .replace(/\{pages\}/g, String(pages));
}

function marginTemplates(settings: PdfSettings): Partial<Record<MarginBox, string>> {
  const boxes: Partial<Record<MarginBox, string>> = {};
  for (const side of ['left', 'center', 'right'] as const) {
    if (settings.header.enabled) boxes[`top-${side}`] = settings.header[side];
    if (settings.footer.enabled) boxes[`bottom-${side}`] = settings.footer[side];
  }
  if (!settings.footer.enabled && settings.showPageNumbers) {
    boxes['bottom-right'] = pageNumberTemplate(settings.pageNumberFormat);
  }
  return boxes;
}

/** Header, footer and page-number text of one page. */
export function pageMarginTexts(settings: PdfSettings, meta: DocumentMeta, page: number, pages: number): Partial<Record<MarginBox, string>> {
  return Object.fromEntries(Object.entries(marginTemplates(settings))
    .map(([box, template]) => [box, resolveTemplate(template, meta, page, pages)]));
}

function buildPageMarginBoxes(settings: PdfSettings, meta: DocumentMeta): string {
  return Object.entries(marginTemplates(settings))
    .map(([box, template]) => `@${box} { content: ${buildHeaderFooterContent(template, meta)}; font-size: 9pt; color: #555; }`)
    .join(' ');
}

function buildTocHtml(contentHtml: string, settings: PdfSettings, tocTitle: string): string {
  if (!settings.showToc) return '';
  // Parse cloned content to walk headings already with IDs assigned by serializer
  const doc = new DOMParser().parseFromString(`<div>${contentHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  const allH = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const items = allH
    .filter(h => !h.closest('[data-footnotes], section.footnotes, nav.pdf-toc'))
    .map(h => ({
      level: Number(h.tagName.charAt(1)),
      text: (h.textContent ?? '').trim(),
      id: h.id,
    }))
    .filter(h => h.level <= settings.tocDepth && h.id);
  if (!items.length) return '';

  const minLevel = Math.min(...items.map(i => i.level));
  const lis = items.map(h => {
    const indent = h.level - minLevel;
    const safe = h.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Three flex children — print CSS reveals the leader+page span via
    // @media print so screen preview stays clean.
    return `<li class="pdf-toc-l${h.level}" style="padding-left:${indent * 16}px"><a href="#${h.id}"><span class="pdf-toc-text">${safe}</span><span class="pdf-toc-leader" aria-hidden="true"></span><span class="pdf-toc-page" aria-hidden="true"></span></a></li>`;
  }).join('');

  const breakClass = settings.tocPageBreak ? ' pdf-toc--break-after' : '';
  return `<nav class="pdf-toc${breakClass}" aria-label="Table of contents"><h2 class="pdf-toc-title">${tocTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h2><ul class="pdf-toc-list">${lis}</ul></nav>`;
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
  const m = resolveMargins(settings);
  const documentStyle = settings.typographySource === 'current-editor'
    ? useDocumentStyle('light').value
    : settings.typographySource === 'custom' ? settings.documentStyleSnapshot : undefined;
  let documentCss = '';
  let resolvedDocumentStyle: ResolvedDocumentStyle | undefined;
  let resolvedHeadingFont: string | undefined;
  if (documentStyle) {
    const resolved = settings.typographySource === 'custom' ? {
      ...documentStyle,
      fontSize: parseFloat(settings.fontSize) * 4 / 3,
      fontFamily: settings.fontFamily === 'document-font' ? documentStyle.fontFamily : getFontStack(settings.fontFamily),
      palette: { ...documentStyle.palette, link: settings.accentColor, table: settings.tableHeaderBg },
    } : documentStyle;
    const headingFont = settings.typographySource === 'custom'
      ? settings.headingFontFamily === 'document-font' ? documentStyle.fontFamily : getFontStack(settings.headingFontFamily)
      : resolved.fontFamily;
    resolvedDocumentStyle = resolved;
    resolvedHeadingFont = headingFont;
    documentCss = documentPrintCss(resolved, headingFont);
    // Scope article styling away from page furniture and TOC controls.
    contentHtml = `<article class="document-root" data-document-style="${resolved.id}">${contentHtml}</article>`;
  }
  if (contentHtml.includes('data-type="katex-')) {
    const root = new DOMParser().parseFromString(contentHtml, 'text/html').body;
    renderMathNodes(root);
    contentHtml = root.innerHTML;
  }
  const bodyFont = resolvedDocumentStyle?.fontFamily ?? getFontStack(settings.fontFamily);
  const headingFont = resolvedHeadingFont ?? getFontStack(settings.headingFontFamily);
  const marginBoxes = buildPageMarginBoxes(settings, meta);
  const watermarkCss = buildWatermarkCss(settings.watermark);
  const watermarkHtml = settings.watermark.enabled && settings.watermark.text
    ? '<div class="pdf-watermark" aria-hidden="true"></div>'
    : '';
  const tocHtml = buildTocHtml(contentHtml, settings, t.value.pdfTocTitle);
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
  --pf-size: ${resolvedDocumentStyle ? `${resolvedDocumentStyle.fontSize * .75}pt` : settings.fontSize};
  --pf-font-body: ${bodyFont};
  --pf-font-heading: ${headingFont};
  --pf-accent: ${settings.accentColor};
  --pf-th-bg: ${settings.tableHeaderBg};
}
${counterReset}
${printCss}
${documentCss}
${contentHtml.includes('katex') ? mathPrintCss : ''}
${watermarkCss}
</style>
</head>
<body>${watermarkHtml}${tocHtml}${contentHtml}</body>
</html>`;
}

function migrateSettings(parsed: Partial<PdfSettings>): PdfSettings {
  const out: PdfSettings = {
    ...PDF_SETTINGS_DEFAULTS,
    ...parsed,
    typographySource: parsed.typographySource ?? 'legacy',
    header: { ...PDF_SETTINGS_DEFAULTS.header, ...(parsed.header ?? {}) },
    footer: { ...PDF_SETTINGS_DEFAULTS.footer, ...(parsed.footer ?? {}) },
    watermark: { ...PDF_SETTINGS_DEFAULTS.watermark, ...(parsed.watermark ?? {}) },
    customMargins: { ...PDF_SETTINGS_DEFAULTS.customMargins, ...(parsed.customMargins ?? {}) },
  };
  if (FONT_LEGACY_MIGRATION[out.fontFamily]) {
    out.fontFamily = FONT_LEGACY_MIGRATION[out.fontFamily];
  }
  if (FONT_LEGACY_MIGRATION[out.headingFontFamily]) {
    out.headingFontFamily = FONT_LEGACY_MIGRATION[out.headingFontFamily];
  }
  // Legacy: if old single customMarginMm exists but no customMargins, expand
  if (!parsed.customMargins && parsed.customMarginMm) {
    const v = parsed.customMarginMm;
    out.customMargins = { top: v, right: v, bottom: v, left: v };
  }
  return out;
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

// WebView2 (Windows) prints an iframe in place; WebKit — macOS WKWebView and
// Linux WebKitGTK — ignores print() on an iframe (#103) and @page margin boxes
// (#163), so it prints a Paged.js layout from a native window. Chromium user
// agents carry a "Chrome/" token; WebKit ones do not.
export const isChromiumWebview = /Chrome\//.test(navigator.userAgent);

/** Lays the print document out into pages in `frame` and numbers the TOC entries. */
export async function paginatePrintDocument(frame: HTMLIFrameElement, doc: string, settings: PdfSettings, meta: DocumentMeta): Promise<number> {
  const firstPage = Math.max(1, settings.startPageNumber | 0);
  const pages = await paginate(frame, doc, (page, total) => pageMarginTexts(settings, meta, page, total), firstPage);
  frame.contentDocument?.querySelectorAll('.pdf-toc-list a').forEach(link => {
    const target = `#${CSS.escape(link.getAttribute('href')?.slice(1) ?? '')}`;
    const index = pages.findIndex(page => page.querySelector(target));
    const number = link.querySelector('.pdf-toc-page');
    if (number && index >= 0) number.textContent = String(firstPage + index);
  });
  return pages.length;
}

export async function printDocument(doc: string, settings: PdfSettings, meta: DocumentMeta): Promise<void> {
  const iframe = document.createElement('iframe');
  // Inside the viewport: WebKit stalls animation frames of off-screen frames,
  // and Paged.js lays pages out on them.
  iframe.style.cssText =
    'position:fixed;top:0;left:0;width:210mm;height:297mm;border:none;opacity:0;pointer-events:none;';
  document.body.appendChild(iframe);

  if (!isChromiumWebview) {
    try {
      await paginatePrintDocument(iframe, doc, settings, meta);
      await invoke('print_document', { html: serializePaged(iframe.contentDocument!), pageSize: settings.pageSize });
    } finally {
      iframe.remove();
    }
    return;
  }

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
    savePdfSettings(settings);
    await loadPrintFonts();
    return printDocument(buildPrintDocument(serializeEditorContent(editorEl), settings, printCssRaw, meta), settings, meta);
  }

  return { exportPdf };
}
