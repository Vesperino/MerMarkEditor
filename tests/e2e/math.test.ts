import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setupTauriMocks } from './helpers/tauri-mock';
import { openCodeView, openVisualView } from './helpers/code-editor';

const path = '/test/math-showcase.md';
const showcase = readFileSync('docs/math-showcase.md', 'utf8');

test('math showcase: edit, save, reopen, offline print and Marp', async ({ page, context }, testInfo) => {
  test.setTimeout(90_000);
  const fs = await setupTauriMocks(page, { initialFs: { [path]: showcase }, openFilePath: path });
  await page.goto('/');
  const formulas = page.locator('.ProseMirror .katex-wrapper');
  await expect(formulas).toHaveCount(46);
  await expect(page.locator('.ProseMirror .math-error')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: testInfo.outputPath('math-editor.png') });
  // The editor suppresses dirty events for 300ms during initial hydration.
  await page.waitForTimeout(400);

  const first = formulas.first();
  await first.locator('.katex-render').dblclick();
  await first.getByRole('textbox').fill('E=mc^3');
  await first.getByRole('textbox').press('Enter');
  await expect(first).toHaveAttribute('data-formula', 'E%3Dmc%5E3');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => fs.getFs()[path]).toContain('$E=mc^3$');
  await openCodeView(page);
  await page.waitForTimeout(500); // allow the view's cursor/scroll restoration to finish
  await openVisualView(page);
  await expect(formulas).toHaveCount(46);
  await page.reload();
  await expect(formulas).toHaveCount(46);
  await expect(formulas.first()).toHaveAttribute('data-formula', 'E%3Dmc%5E3');
  await formulas.first().locator('.katex-render').dblclick();
  await formulas.first().getByRole('textbox').fill('E=mc^2');
  await formulas.first().getByRole('textbox').press('Enter');

  const output = await page.evaluate(async () => {
    const serializerPath = '/src/utils/documentSerializer.ts';
    const pdfPath = '/src/composables/usePdfExport.ts';
    const marpPath = '/src/composables/useMarpExport.ts';
    const { serializeEditorContent } = await import(/* @vite-ignore */ serializerPath);
    const { buildPrintDocument, PDF_SETTINGS_DEFAULTS } = await import(/* @vite-ignore */ pdfPath);
    const { renderDeck, buildStandaloneHtml } = await import(/* @vite-ignore */ marpPath);
    const root = document.querySelector('.ProseMirror') as HTMLElement;
    return {
      print: buildPrintDocument(serializeEditorContent(root), PDF_SETTINGS_DEFAULTS, (await import(/* @vite-ignore */ '/src/styles/print.css?raw')).default, { title: 'Matematyka w MerMark Editor' }),
      deck: buildStandaloneHtml(renderDeck('---\nmarp: true\n---\n# Math\n\n' + String.raw`\(U=RI\)` + '\n\n```math\nP=UI\n```')),
    };
  });
  expect(output.print).toContain('data:font/woff2;base64,');
  expect(output.print).not.toContain('katex-actions');
  const printPage = await context.newPage();
  const external: string[] = [];
  printPage.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await context.setOffline(true);
  await printPage.setContent(output.print);
  await printPage.evaluate(() => document.fonts.ready);
  await expect(printPage.locator('.katex')).toHaveCount(46);
  expect(await printPage.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true);
  expect(external).toEqual([]);
  await printPage.screenshot({ path: testInfo.outputPath('math-print.png'), fullPage: true });
  await printPage.pdf({ path: testInfo.outputPath('math-showcase.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await printPage.setContent(output.deck);
  expect(await printPage.locator('mjx-container').count()).toBe(2);
  await printPage.screenshot({ path: testInfo.outputPath('math-marp.png') });
});

test('invalid formula is editable; toolbar inserts inline and block formulas', async ({ page }) => {
  await setupTauriMocks(page, { initialFs: { [path]: '$\\notACommand{x}$' }, openFilePath: path });
  await page.goto('/');
  const formula = page.locator('.katex-wrapper').first();
  await expect(formula.locator('.math-error')).toBeVisible();
  await formula.locator('.katex-render').focus();
  await page.keyboard.press('Enter');
  await formula.getByRole('textbox').fill('x^2');
  await formula.getByRole('textbox').press('Enter');
  await expect(page.locator('.math-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Inline formula', exact: true }).click();
  await expect(page.locator('.katex-inline')).toHaveCount(2);
  await page.getByRole('button', { name: 'Block formula', exact: true }).click();
  await expect(page.locator('.katex-block')).toHaveCount(1);
});
