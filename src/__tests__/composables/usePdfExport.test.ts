import { describe, it, expect } from 'vitest';
import {
  buildPrintDocument,
  buildHeaderFooterContent,
  PDF_SETTINGS_DEFAULTS,
  type PdfSettings,
} from '../../composables/usePdfExport';

const FAKE_CSS = 'body { color: red; }';

function withSettings(overrides: Partial<PdfSettings>): PdfSettings {
  return {
    ...PDF_SETTINGS_DEFAULTS,
    ...overrides,
    header: { ...PDF_SETTINGS_DEFAULTS.header, ...(overrides.header ?? {}) },
    footer: { ...PDF_SETTINGS_DEFAULTS.footer, ...(overrides.footer ?? {}) },
    watermark: { ...PDF_SETTINGS_DEFAULTS.watermark, ...(overrides.watermark ?? {}) },
  };
}

describe('buildPrintDocument', () => {
  it('produces valid HTML5 doctype', () => {
    const html = buildPrintDocument('<p>test</p>', PDF_SETTINGS_DEFAULTS, FAKE_CSS);
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it('embeds font size as CSS custom property', () => {
    const html = buildPrintDocument('<p>test</p>', withSettings({ fontSize: '12pt' }), FAKE_CSS);
    expect(html).toContain('--pf-size: 12pt');
  });

  it('embeds narrow margin (10mm) when margins=narrow', () => {
    const html = buildPrintDocument('<p>test</p>', withSettings({ margins: 'narrow' }), FAKE_CSS);
    expect(html).toContain('10mm');
  });

  it('embeds wide margin (25mm) when margins=wide', () => {
    const html = buildPrintDocument('<p>test</p>', withSettings({ margins: 'wide' }), FAKE_CSS);
    expect(html).toContain('25mm');
  });

  it('embeds page size in @page rule', () => {
    const html = buildPrintDocument('<p>test</p>', withSettings({ pageSize: 'Letter' }), FAKE_CSS);
    expect(html).toContain('size: Letter');
  });

  it('embeds provided CSS', () => {
    const html = buildPrintDocument('<p>test</p>', PDF_SETTINGS_DEFAULTS, FAKE_CSS);
    expect(html).toContain('body { color: red; }');
  });

  it('embeds content HTML in body', () => {
    const html = buildPrintDocument('<p>hello world</p>', PDF_SETTINGS_DEFAULTS, FAKE_CSS);
    expect(html).toContain('<p>hello world</p>');
  });

  it('embeds accent color as CSS variable', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({ accentColor: '#ff0000' }), FAKE_CSS);
    expect(html).toContain('--pf-accent: #ff0000');
  });

  it('embeds font family stack for body when fontFamily=inter', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({ fontFamily: 'inter' }), FAKE_CSS);
    expect(html).toContain('Inter');
  });

  it('falls back to first font when fontFamily id is unknown', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({ fontFamily: 'nonexistent' }), FAKE_CSS);
    expect(html).toContain('Charter');
  });

  it('applies uniform custom margin when margins=custom and all sides equal', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      margins: 'custom',
      customMargins: { top: 30, right: 30, bottom: 30, left: 30 },
    }), FAKE_CSS);
    expect(html).toContain('30mm 30mm 30mm 30mm');
  });

  it('applies per-direction custom margins', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      margins: 'custom',
      customMargins: { top: 12, right: 24, bottom: 35, left: 8 },
    }), FAKE_CSS);
    expect(html).toContain('12mm 24mm 35mm 8mm');
  });

  it('renders preview header div when header.enabled', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      header: { enabled: true, left: 'L', center: 'C', right: 'R' },
    }), FAKE_CSS);
    expect(html).toContain('pdf-preview-header');
    expect(html).toContain('>L<');
    expect(html).toContain('>C<');
    expect(html).toContain('>R<');
  });

  it('emits @bottom-right page counter when footer disabled but page numbers enabled', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      footer: { enabled: false, left: '', center: '', right: '' },
      showPageNumbers: true,
      pageNumberFormat: 'n-of-total',
    }), FAKE_CSS);
    expect(html).toContain('@bottom-right');
    expect(html).toContain('counter(page)');
  });

  it('emits header margin boxes when header.enabled=true', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      header: { enabled: true, left: '{title}', center: '', right: '{date}' },
    }), FAKE_CSS, { title: 'MyDoc' });
    expect(html).toContain('@top-left');
    expect(html).toContain('"MyDoc"');
  });

  it('includes watermark element and CSS when watermark.enabled=true', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({
      watermark: { enabled: true, text: 'POUFNE', opacity: 0.1, rotate: -45, color: '#999', size: '100pt' },
    }), FAKE_CSS);
    expect(html).toContain('class="pdf-watermark"');
    expect(html).toContain('POUFNE');
    expect(html).toContain('rotate(-45deg)');
  });

  it('resets page counter when startPageNumber > 1', () => {
    const html = buildPrintDocument('<p>x</p>', withSettings({ startPageNumber: 5 }), FAKE_CSS);
    expect(html).toContain('counter-reset: page 4');
  });

  it('does not generate TOC when showToc=false', () => {
    const html = buildPrintDocument('<h1 id="pdf-h-a">A</h1>', withSettings({ showToc: false }), FAKE_CSS);
    expect(html).not.toContain('pdf-toc');
  });

  it('generates TOC nav with anchor links when showToc=true', () => {
    const content = '<h1 id="pdf-h-intro">Intro</h1><h2 id="pdf-h-body">Body</h2>';
    const html = buildPrintDocument(content, withSettings({ showToc: true, tocDepth: 3 }), FAKE_CSS);
    expect(html).toContain('class="pdf-toc"');
    expect(html).toContain('href="#pdf-h-intro"');
    expect(html).toContain('href="#pdf-h-body"');
    expect(html).toContain('>Intro<');
    expect(html).toContain('>Body<');
  });

  it('respects tocDepth (skips deeper headings)', () => {
    const content = '<h1 id="pdf-h-a">A</h1><h2 id="pdf-h-b">B</h2><h3 id="pdf-h-c">C</h3>';
    const html = buildPrintDocument(content, withSettings({ showToc: true, tocDepth: 2 }), FAKE_CSS);
    expect(html).toContain('href="#pdf-h-a"');
    expect(html).toContain('href="#pdf-h-b"');
    expect(html).not.toContain('href="#pdf-h-c"');
  });
});

describe('buildHeaderFooterContent', () => {
  it('returns empty quoted string for empty template', () => {
    expect(buildHeaderFooterContent('', {})).toBe('""');
  });

  it('returns string literal for plain text', () => {
    expect(buildHeaderFooterContent('Hello', {})).toBe('"Hello"');
  });

  it('substitutes {title} as string literal', () => {
    expect(buildHeaderFooterContent('{title}', { title: 'Doc' })).toBe('"Doc"');
  });

  it('substitutes {page} as counter call', () => {
    expect(buildHeaderFooterContent('{page}', {})).toBe('counter(page)');
  });

  it('substitutes {page}/{pages} as mixed counter calls', () => {
    const r = buildHeaderFooterContent('{page}/{pages}', {});
    expect(r).toContain('counter(page)');
    expect(r).toContain('counter(pages)');
    expect(r).toContain('"/"');
  });

  it('mixes literal and tokens', () => {
    const r = buildHeaderFooterContent('Strona {page} z {pages}', {});
    expect(r).toContain('"Strona "');
    expect(r).toContain('counter(page)');
    expect(r).toContain('" z "');
    expect(r).toContain('counter(pages)');
  });

  it('escapes embedded double quotes in literals', () => {
    const r = buildHeaderFooterContent('say "hi"', {});
    expect(r).toContain('\\"hi\\"');
  });
});
