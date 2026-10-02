import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inflateRawSync } from 'node:zlib';
import { Packer } from 'docx';
import { DOCUMENT_STYLES, resolveDocumentStyle } from '../../styles/document-themes';
import { documentPrintCss } from '../../styles/document-themes/print';
import { buildDocxDocument } from '../../composables/useDocxExport';
import { buildPrintDocument, loadPdfSettings, PDF_SETTINGS_DEFAULTS } from '../../composables/usePdfExport';

// Read a real DOCX ZIP entry using its central directory (not implementation objects).
function zipEntry(zip: Buffer, name: string): string {
  for (let i = 0; i < zip.length - 46; i++) {
    if (zip.readUInt32LE(i) !== 0x02014b50) continue;
    const length = zip.readUInt16LE(i + 28);
    if (zip.subarray(i + 46, i + 46 + length).toString() !== name) continue;
    const offset = zip.readUInt32LE(i + 42);
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const bytes = zip.subarray(start, start + zip.readUInt32LE(i + 20));
    return (zip.readUInt16LE(i + 10) === 8 ? inflateRawSync(bytes) : bytes).toString();
  }
  throw new Error(`Missing ZIP entry: ${name}`);
}

describe('document style settings', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  it('defaults to GitHub and migrates only custom legacy typography', async () => {
    localStorage.setItem('mermark-settings', JSON.stringify({ editorFontFamily: 'georgia', editorLineHeight: 2, editorPaddingX: 90 }));
    const { useSettings } = await import('../../composables/useSettings');
    const { settings } = useSettings();
    expect(settings.value.documentStyle).toBe('github');
    expect(settings.value.documentStyleOverrides.github).toEqual({ fontFamily: 'georgia', lineHeight: 2 });
    expect(settings.value).not.toHaveProperty('editorPaddingX');
  });
  it('keeps defaults inherited and normalizes corrupt selections and numbers', async () => {
    localStorage.setItem('mermark-settings', JSON.stringify({ documentStyle: 'missing', documentStyleOverrides: { github: { fontSize: 999, lineHeight: 'oops' }, missing: { fontSize: 20 } } }));
    const { settings } = (await import('../../composables/useSettings')).useSettings();
    expect(settings.value.documentStyle).toBe('github');
    expect(settings.value.documentStyleOverrides).toEqual({ github: { fontSize: 32 } });
  });
  it('remembers and resets overrides independently for each style', async () => {
    const { settings, setDocumentStyle, setDocumentStyleOverride, resetDocumentStyleOverrides } = (await import('../../composables/useSettings')).useSettings();
    setDocumentStyleOverride('fontSize', 20);
    setDocumentStyle('obsidian-minimal'); setDocumentStyleOverride('contentWidth', 800);
    setDocumentStyle('github');
    expect(settings.value.documentStyleOverrides.github).toEqual({ fontSize: 20 });
    setDocumentStyleOverride('fontSize', undefined);
    setDocumentStyle('obsidian-minimal');
    expect(settings.value.documentStyleOverrides['obsidian-minimal']).toEqual({ contentWidth: 800 });
    resetDocumentStyleOverrides();
    expect(settings.value.documentStyleOverrides['obsidian-minimal']).toBeUndefined();
  });
});

describe('document export styles', () => {
  it.each(DOCUMENT_STYLES)('exports $label with its own heading hierarchy and no app asset paths', async definition => {
    const style = resolveDocumentStyle(definition.id, { fontSize: 20 });
    const css = documentPrintCss(style);
    expect(css).toContain('--doc-font-size: 20px');
    expect(css).toContain(`--doc-h1-size: ${definition.headings[0].size}`);
    expect(css).not.toMatch(/url\("\.\//);
    if (definition.id.startsWith('typora-')) expect(css).toContain('data:font/');
    const buffer = await Packer.toBuffer(buildDocxDocument('<h1>Heading</h1><h6>Detail</h6><p>Keep <strong>bold <em>and italic</em></strong> words.</p>', style));
    const styles = zipEntry(buffer, 'word/styles.xml');
    const doc = zipEntry(buffer, 'word/document.xml');
    expect(styles).toContain('w:sz w:val="30"'); // 20px = 15pt = 30 half-points
    expect(styles).toContain(`w:sz w:val="${Math.round(20 * definition.headings[0].size * 1.5)}"`);
    expect(doc).toContain('w:pStyle w:val="Heading6"');
    if (definition.id.startsWith('ia-')) expect(styles).toContain('<w:caps');
    if (definition.id === 'obsidian-minimal') expect(styles).toContain('<w:smallCaps');
    expect(doc).toContain('and italic');
    expect(doc).toContain('<w:i/>');
    expect(doc).toContain('<w:b/>');
  });
  it('preserves legacy PDF settings instead of silently replacing their fonts', () => {
    localStorage.setItem('mermark.pdfSettings', JSON.stringify({ fontFamily: 'georgia', fontSize: '11pt' }));
    const settings = loadPdfSettings();
    expect(settings.typographySource).toBe('legacy');
    expect(settings.fontFamily).toBe('georgia');
    expect(buildPrintDocument('<h1>Title</h1>', settings, '')).not.toContain('class="document-root"');
  });
  it('uses current editor by default and keeps print margins outside the document root', () => {
    const html = buildPrintDocument('<h1>Title</h1>', PDF_SETTINGS_DEFAULTS, '');
    expect(html).toContain('class="document-root"');
    expect(html).toContain('--doc-font-size: 16px');
    expect(html).toContain('margin: 18mm 18mm 22mm 18mm');
    expect(html).not.toContain('zoom:');
  });
});
