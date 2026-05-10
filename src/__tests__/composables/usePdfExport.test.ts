import { describe, it, expect } from 'vitest';
import { buildPrintDocument } from '../../composables/usePdfExport';

const FAKE_CSS = 'body { color: red; }';

describe('buildPrintDocument', () => {
  it('produces valid HTML5 doctype', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'normal',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toMatch(/^<!DOCTYPE html>/i);
  });

  it('embeds font size as CSS custom property', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '12pt',
      margins: 'normal',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toContain('--pf-size: 12pt');
  });

  it('embeds narrow margin (10mm) when margins=narrow', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'narrow',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toContain('margin: 10mm');
  });

  it('embeds normal margin (18mm) when margins=normal', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'normal',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toContain('margin: 18mm');
  });

  it('embeds wide margin (25mm) when margins=wide', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'wide',
      pageSize: 'Letter',
    }, FAKE_CSS);
    expect(html).toContain('margin: 25mm');
  });

  it('embeds page size in @page rule', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'normal',
      pageSize: 'Letter',
    }, FAKE_CSS);
    expect(html).toContain('size: Letter');
  });

  it('embeds provided CSS', () => {
    const html = buildPrintDocument('<p>test</p>', {
      fontSize: '10pt',
      margins: 'normal',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toContain('body { color: red; }');
  });

  it('embeds content HTML in body', () => {
    const html = buildPrintDocument('<p>hello world</p>', {
      fontSize: '10pt',
      margins: 'normal',
      pageSize: 'A4',
    }, FAKE_CSS);
    expect(html).toContain('<p>hello world</p>');
  });
});
