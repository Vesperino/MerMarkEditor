import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const BREAK = '<div style="page-break-after: always;"></div>';
const threePages = `# Chapter one\n\nOpening paragraph.\n\n${BREAK}\n\n## Chapter two\n\nMiddle paragraph.\n\n${BREAK}\n\n## Chapter three\n\nClosing paragraph.`;
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const HEADER = { enabled: true, left: '{title}', center: '', right: 'Confidential' };
const FOOTER = { enabled: true, left: '{path}', center: '', right: '{page}/{pages}' };

async function open(page: Page, markdown: string, pdfSettings: Record<string, unknown>, rendered = 'h1') {
  await page.addInitScript(stored => localStorage.setItem('mermark.pdfSettings', stored), JSON.stringify({ typographySource: 'legacy', header: HEADER, footer: FOOTER, ...pdfSettings }));
  await setupTauriMocks(page, { initialFs: { '/docs/report.md': markdown }, openFilePath: '/docs/report.md' });
  await page.goto('/');
  await expect(page.locator(`.editor-pane.active .ProseMirror ${rendered}`)).toBeVisible();
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  return page.frameLocator('.pdf-preview-frame');
}

/** Visible header/footer text of every page, keyed by margin box. */
function marginTexts(scope: FrameLocator | Page) {
  return scope.locator('.pagedjs_page').evaluateAll(pages => pages.map(page => Object.fromEntries(
    Array.from(page.querySelectorAll('.pagedjs_margin'))
      .filter(box => getComputedStyle(box).visibility === 'visible' && box.textContent!.trim())
      .map(box => [/pagedjs_margin-([a-z-]+)/.exec(box.className)![1], box.textContent!.trim()]),
  )));
}

function expectedPages(count: number, boxes: (n: number) => Record<string, string>, first = 1) {
  return Array.from({ length: count }, (_, i) => boxes(first + i));
}

test('preview lays the document out in pages with header, footer and page numbers', async ({ page }) => {
  const frame = await open(page, threePages, {});
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, n => ({
    'top-left': 'report', 'top-right': 'Confidential', 'bottom-left': '/docs/report.md', 'bottom-right': `${n}/3`,
  })));
  await expect(frame.locator('.pagedjs_page').nth(1).locator('h2')).toHaveText('Chapter two');
  expect(await frame.locator('.pagedjs_margin-bottom-right .pagedjs_margin-content').first().evaluate(el => getComputedStyle(el, '::after').content)).toBe('none');

  await page.locator('.pdf-tab').nth(2).click();
  await page.getByTestId('pdf-header-enabled').uncheck();
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, n => ({ 'bottom-left': '/docs/report.md', 'bottom-right': `${n}/3` })));
});

test('page numbers stay when the footer is off and follow the chosen format', async ({ page }) => {
  const frame = await open(page, threePages, { header: { ...HEADER, enabled: false }, showPageNumbers: true, pageNumberFormat: 'n-of-total' });
  await page.locator('.pdf-tab').nth(2).click();
  await page.getByTestId('pdf-footer-enabled').uncheck();
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, n => ({ 'bottom-right': `${n}/3` })));

  await page.locator('select:has(option[value="page-n-of-total"])').selectOption('page-n-of-total');
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, n => ({ 'bottom-right': `Page ${n} of 3` })));

  await page.getByText('Page numbers (when footer disabled)').click();
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, () => ({})));
});

test('numbering starts at the chosen first page and the TOC points at real pages', async ({ page }) => {
  const frame = await open(page, threePages, { header: { ...HEADER, enabled: false }, startPageNumber: 5, showToc: true });
  await expect.poll(() => marginTexts(frame)).toEqual(expectedPages(3, n => ({ 'bottom-left': '/docs/report.md', 'bottom-right': `${n}/7` }), 5));
  expect(await frame.locator('.pdf-toc-list a').evaluateAll(links => links.map(a => [a.querySelector('.pdf-toc-text')!.textContent, a.querySelector('.pdf-toc-page')!.textContent])))
    .toEqual([['Chapter one', '5'], ['Chapter two', '6'], ['Chapter three', '7']]);
});

test('a long document flows over many pages, each numbered against the total', async ({ page }) => {
  const long = '# Report\n\n' + Array.from({ length: 40 }, (_, i) => `## Section ${i + 1}\n\n${'Paged media keeps headers and footers on every sheet. '.repeat(8)}`).join('\n\n');
  const frame = await open(page, long, { header: { ...HEADER, enabled: false } });
  await expect.poll(async () => {
    const texts = await marginTexts(frame);
    return texts.length > 3 && JSON.stringify(texts) === JSON.stringify(expectedPages(texts.length, n => ({ 'bottom-left': '/docs/report.md', 'bottom-right': `${n}/${texts.length}` })));
  }).toBe(true);
  await expect(frame.locator('.pagedjs_page').last().locator('h2', { hasText: /^Section 40$/ })).toHaveCount(1);
});

test('math, diagrams, images, tables, page breaks and watermark survive pagination', async ({ page }, testInfo) => {
  await page.route('https://example.com/pixel.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(PIXEL, 'base64') }));
  const rows = Array.from({ length: 45 }, (_, i) => `| Row ${i + 1} | ${i * 3} |`);
  const markdown = [
    '# Report', 'Inline math $E = mc^2$ in text.', '$$\n\\int_0^1 x^2 \\, dx\n$$', '![pixel](https://example.com/pixel.png)',
    '```mermaid\ngraph LR\n  A[Start] --> B[End]\n```', BREAK, '## Table', ['| Name | Value |', '| --- | --- |', ...rows].join('\n'),
  ].join('\n\n');
  const frame = await open(page, markdown, { showToc: true, watermark: { enabled: true, text: 'DRAFT', opacity: 0.1, rotate: -30, color: '#888888', size: '120pt' } }, '.mermaid-content svg');
  await expect.poll(async () => (await marginTexts(frame)).map(texts => texts['bottom-right']).join()).toMatch(/^1\/(\d+),2\/\1,3\/\1/);
  const pages = frame.locator('.pagedjs_page');
  const pageOf = (selector: string) => pages.evaluateAll((all, s) => all.findIndex(p => p.querySelector(s)), selector);
  await expect(frame.locator('.katex')).toHaveCount(2);
  await expect(frame.locator('.mermaid-print-figure svg')).toHaveCount(1);
  await expect.poll(() => frame.locator('img[alt="pixel"]').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(1);
  const tablePage = await pageOf('h2#table');
  expect(tablePage).toBeGreaterThan(await pageOf('.mermaid-print-figure'));
  expect(await pages.nth(tablePage).locator('.pagedjs_area h2, .pagedjs_area p, .pagedjs_area figure').first().textContent()).toBe('Table');
  expect(await frame.locator('tr:has(td)').evaluateAll(trs => trs.map(tr => tr.querySelector('td')!.textContent))).toEqual(Array.from({ length: 45 }, (_, i) => `Row ${i + 1}`));
  expect(await pages.evaluateAll(all => all.findIndex(p => p.textContent!.includes('Row 45')))).toBeGreaterThan(tablePage);
  await expect(frame.locator('.pdf-watermark')).toHaveCount(await pages.count());
  await expect(frame.locator('.pdf-toc-list a[href="#table"] .pdf-toc-page')).toHaveText(String(tablePage + 1));
  await page.locator('.pdf-preview-area').screenshot({ path: testInfo.outputPath(`preview-${testInfo.project.name}.png`) });
});

test('printing sends the paginated layout to WebKit and the native document to Chromium', async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem('mermark-settings', JSON.stringify({ documentStyle: 'ia-helvetica', ai: { hasSeenFirstRun: true } })));
  const frame = await open(page, threePages.replace('Opening paragraph.', '###### Lead\n\nRuns on after the heading.'), { typographySource: 'current-editor' });
  await expect.poll(() => marginTexts(frame)).toHaveLength(3);
  await page.evaluate(() => {
    const w = window as unknown as { printed?: { cmd: string; html: string; pageSize?: string }; __TAURI_INTERNALS__: { invoke: (cmd: string, args: Record<string, unknown>) => unknown } };
    const invoke = w.__TAURI_INTERNALS__.invoke;
    w.__TAURI_INTERNALS__.invoke = (cmd, args) => {
      if (cmd === 'print_document') w.printed = { cmd, html: args.html as string, pageSize: args.pageSize as string };
      return invoke(cmd, args);
    };
    const append = Node.prototype.appendChild;
    Node.prototype.appendChild = function <T extends Node>(this: Node, child: T): T {
      const added = append.call(this, child) as T;
      if (child instanceof HTMLIFrameElement && child.contentWindow) {
        child.contentWindow.print = () => { w.printed = { cmd: 'print', html: child.contentDocument!.documentElement.outerHTML }; };
      }
      return added;
    };
  });
  await page.getByTestId('pdf-confirm').click();
  await expect.poll(() => page.evaluate(() => 'printed' in window)).toBe(true);
  const printed = await page.evaluate(() => (window as unknown as { printed: { cmd: string; html: string; pageSize?: string } }).printed);

  if (browserName === 'chromium') {
    expect(printed.cmd).toBe('print');
    expect(printed.html).toContain('@bottom-right');
    expect(printed.html).not.toContain('pagedjs_page');
    return;
  }
  expect(printed.cmd).toBe('print_document');
  expect(printed.pageSize).toBe('A4');
  expect(printed.html).not.toContain('<script');
  expect(printed.html).not.toContain('pagedjs-content');
  const sheet = await page.context().newPage();
  await sheet.setContent(printed.html);
  const styles = (scope: FrameLocator | Page) => scope.locator('.pagedjs_area *').evaluateAll(els => els.map(el => {
    const css = getComputedStyle(el);
    return [el.tagName, css.display, css.marginTop, css.marginBottom, css.fontSize].join(' ');
  }));
  expect(await sheet.locator('h6 + p').evaluate(el => getComputedStyle(el).display)).toBe('inline');
  expect(await styles(sheet)).toEqual(await styles(frame));
  const box = await sheet.locator('.pagedjs_page').first().boundingBox();
  const area = await sheet.locator('.pagedjs_page').first().locator('.pagedjs_area').boundingBox();
  const mm = (px: number) => px / 96 * 25.4;
  expect([mm(box!.width), mm(box!.height)].map(Math.round)).toEqual([210, 297]);
  expect([mm(area!.x - box!.x), mm(area!.y - box!.y)].map(Math.round)).toEqual([18, 18]);
  await sheet.emulateMedia({ media: 'print' });
  expect(await marginTexts(sheet)).toEqual(expectedPages(3, n => ({
    'top-left': 'report', 'top-right': 'Confidential', 'bottom-left': '/docs/report.md', 'bottom-right': `${n}/3`,
  })));
});
