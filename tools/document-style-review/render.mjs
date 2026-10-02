import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../../output/playwright/document-style-review/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1120 }, deviceScaleFactor: 1 });
const errors = []; page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.THEME_REVIEW_URL ?? 'http://localhost:1434');
  await page.locator('.document-root h6').first().waitFor();
  await page.locator('.mermaid-wrapper .mermaid-content svg').first().waitFor({ state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  const ids = await page.locator('[data-testid="style-0"] option').evaluateAll(options => options.map(option => option.value));
  const metrics = [];
  const originalText = await page.locator('[data-testid="pane-0"] .tiptap').textContent();
  for (const id of ids) {
    await page.locator('[data-testid="style-0"]').selectOption(id);
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('button', { name: 'H1–H6', exact: true }).click();
    await page.screenshot({ path: `${output}${id}.png` });
    const data = await page.locator('[data-testid="pane-0"] .document-root').evaluate(root => ({ font: getComputedStyle(root).fontFamily, size: getComputedStyle(root).fontSize, lineHeight: getComputedStyle(root).lineHeight, headings: Array.from(root.querySelectorAll('.tiptap > h1, .tiptap > h2, .tiptap > h3, .tiptap > h4, .tiptap > h5, .tiptap > h6')).slice(1,7).map(h => ({ level: h.tagName, size: getComputedStyle(h).fontSize, weight: getComputedStyle(h).fontWeight, italic: getComputedStyle(h).fontStyle, variant: getComputedStyle(h).fontVariant, transform: getComputedStyle(h).textTransform })) }));
    if (await page.locator('[data-testid="pane-0"] .tiptap').textContent() !== originalText) throw new Error(`${id} changed demo text`);
    const missingImages = await page.locator('[data-testid="pane-0"] img').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).length);
    if (missingImages) throw new Error(`${id} has missing images`);
    metrics.push({ id, ...data });
    const download = page.waitForEvent('download');
    await page.locator('.review-column').first().getByRole('button', { name: 'Export HTML' }).click();
    await (await download).saveAs(`${output}${id}.html`);
  }
  await page.getByTestId('style-0').selectOption('ia-helvetica');
  await page.getByTestId('native-size').check();
  if (await page.locator('[data-testid="pane-0"] .document-root').evaluate(el => getComputedStyle(el).fontSize) !== '15px') throw new Error('Native size did not apply');
  await page.getByTestId('native-size').uncheck();
  await page.getByRole('button', { name: 'Paragraphs', exact: true }).click();
  if (await page.getByTestId('pane-0').evaluate(el => el.scrollTop) === 0) throw new Error('Section navigation did not scroll');
  // A user wheel event selects the scroll source; paired panes align corresponding blocks.
  await page.getByTestId('pane-0').hover(); await page.mouse.wheel(0, 350);
  await page.waitForTimeout(200);
  if (await page.getByTestId('pane-1').evaluate(el => el.scrollTop) === 0) throw new Error('Synchronized scrolling did not scroll');
  await page.getByTestId('dark-mode').check();
  await page.screenshot({ path: `${output}dark-comparison.png` });
  await writeFile(`${output}metrics.json`, JSON.stringify({ metrics, errors }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Rendered ${ids.length} styles to ${output}`);
} finally { await browser.close(); }
