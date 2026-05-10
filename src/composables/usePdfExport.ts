import { serializeEditorContent } from '../utils/documentSerializer';
import printCssRaw from '../styles/print.css?raw';
import { DOM_SELECTORS } from '../constants';

export interface PdfSettings {
  fontSize: '8pt' | '9pt' | '10pt' | '11pt' | '12pt';
  margins: 'narrow' | 'normal' | 'wide';
  pageSize: 'A4' | 'Letter' | 'A3';
}

export const PDF_SETTINGS_STORAGE_KEY = 'mermark.pdfSettings';

export const PDF_SETTINGS_DEFAULTS: PdfSettings = {
  fontSize: '10pt',
  margins: 'normal',
  pageSize: 'A4',
};

const MARGIN_MAP: Record<PdfSettings['margins'], string> = {
  narrow: '10mm',
  normal: '18mm',
  wide: '25mm',
};

export function buildPrintDocument(
  contentHtml: string,
  settings: PdfSettings,
  printCss: string,
): string {
  const margin = MARGIN_MAP[settings.margins];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page { size: ${settings.pageSize}; margin: ${margin}; }
:root { --pf-size: ${settings.fontSize}; }
${printCss}
</style>
</head>
<body>${contentHtml}</body>
</html>`;
}

export function loadPdfSettings(): PdfSettings {
  try {
    const raw = localStorage.getItem(PDF_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PdfSettings>;
      return { ...PDF_SETTINGS_DEFAULTS, ...parsed };
    }
  } catch {
    // ignore corrupt storage
  }
  return { ...PDF_SETTINGS_DEFAULTS };
}

export function savePdfSettings(settings: PdfSettings): void {
  localStorage.setItem(PDF_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

async function _doPrint(editorEl: HTMLElement, settings: PdfSettings): Promise<void> {
  savePdfSettings(settings);
  const contentHtml = serializeEditorContent(editorEl);
  const doc = buildPrintDocument(contentHtml, settings, printCssRaw);

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

  // Give browser time to lay out SVGs and load fonts
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
  async function exportPdf(settings: PdfSettings): Promise<void> {
    const editorEl = document.querySelector<HTMLElement>(
      `${DOM_SELECTORS.ACTIVE_EDITOR_CONTAINER} .ProseMirror`,
    ) ?? document.querySelector<HTMLElement>('.ProseMirror');

    if (!editorEl) return;
    return _doPrint(editorEl, settings);
  }

  return { exportPdf };
}
