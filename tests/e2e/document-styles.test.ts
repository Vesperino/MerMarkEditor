import { test, expect, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';
import { mkdir } from 'node:fs/promises';
const source = '# Document title\n\nA paragraph that introduces the document and wraps naturally as its width changes.\n\nA second paragraph with **bold** and *italic* text.\n\n## Section\n\n### Subsection\n\n#### Detail\n\n##### Smaller heading\n\n###### Fine detail\n\nBody text beneath the smallest heading.\n\n> A quotation.\n\n- One item\n- Another item\n\n| Item | Status |\n| --- | --- |\n| Styles | Ready |\n\n```javascript\nconst greeting = "Hello, world!";\n```';
const main = '.editor-pane.active .document-root';
async function start(page: Page, theme = 'light') {
  await page.addInitScript(mode => { if (!localStorage.getItem('mermark-settings')) localStorage.setItem('mermark-settings', JSON.stringify({ theme: mode, codeTheme: 'white', ai: { hasSeenFirstRun: true, checkCliHealthOnStartup: false } })); }, theme);
  await setupTauriMocks(page, { initialFs: { '/docs/styles.md': source }, openFilePath: '/docs/styles.md' });
  await page.goto('/');
  await expect(page.locator(`${main} h1`)).toHaveText('Document title');
  await page.locator('.settings-btn').click();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
}
async function range(page: Page, key: string, value: number) {
  await page.getByTestId(`override-${key}`).evaluate((input, n) => { (input as HTMLInputElement).value = String(n); input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function sizes(page: Page) {
  return page.locator(main).evaluate(root => ({
    body: parseFloat(getComputedStyle(root).fontSize),
    h1: parseFloat(getComputedStyle(root.querySelector('h1')!).fontSize),
    line: parseFloat(getComputedStyle(root.querySelector('p')!).lineHeight),
    gap: parseFloat(getComputedStyle(root.querySelector('p')!).marginBottom),
    width: root.querySelector('.tiptap')!.getBoundingClientRect().width,
    codeBg: getComputedStyle(root.querySelector('pre')!).backgroundColor,
  }));
}

test('all seven styles render matching editor previews with independent, persistent overrides', async ({ page }) => {
  await start(page);
  const selector = page.getByTestId('document-style-select');
  await expect(selector).toHaveValue('github');
  await expect(selector.locator('option')).toHaveCount(7);
  await expect(page.getByTestId('document-overrides')).not.toHaveAttribute('open');
  const expected: Record<string, number> = { github: 32, 'obsidian-default': 25.888, 'obsidian-minimal': 18, 'typora-github': 36, 'typora-newsprint': 30, 'ia-helvetica': 16 * 23 / 19, 'ia-palatino': 16 * 23 / 19 };
  for (const [id, h1] of Object.entries(expected)) {
    await selector.selectOption(id);
    await expect(page.locator(main)).toHaveAttribute('data-document-style', id);
    const actual = await sizes(page);
    expect(actual.h1).toBeCloseTo(h1, 2);
    expect(actual.body).toBe(16);
    expect(actual.width).toBeCloseTo(680, 0);
    expect(actual.codeBg).toBe('rgb(248, 250, 252)');
    const preview = page.getByTestId('document-preview');
    await expect(preview.locator('h6')).toHaveText('Fine detail');
    expect(await preview.locator('a').first().evaluate(el => getComputedStyle(el).textDecorationLine)).toBe(['github', 'typora-github'].includes(id) ? 'none' : 'underline');
    expect(await preview.locator('h1').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(h1, 2);
  }
  await selector.selectOption('github');
  await page.getByTestId('document-overrides').locator('summary').click();
  const before = await sizes(page);
  await range(page, 'fontSize', 20);
  const bigger = await sizes(page);
  expect(bigger.h1).toBe(40);
  expect(bigger.line / before.line).toBeCloseTo(1.25);
  expect(bigger.gap / before.gap).toBeCloseTo(1.25);
  await range(page, 'contentWidth', 800);
  expect((await sizes(page)).width).toBeCloseTo(800, 0);
  await selector.selectOption('obsidian-minimal');
  expect((await sizes(page)).body).toBe(16);
  await range(page, 'paragraphSpacing', 2);
  await selector.selectOption('github');
  expect((await sizes(page)).body).toBe(20);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.tab-unsaved')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mermark-settings')!).documentStyleOverrides.github.fontSize)).toBe(20);
  await page.reload();
  await expect(page.locator(`${main} h1`)).toHaveText('Document title');
  expect((await sizes(page)).body).toBe(20);
  await page.locator('.settings-btn').click();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  await page.getByTestId('document-overrides').locator('summary').click();
  await page.getByRole('button', { name: 'Reset overrides', exact: true }).click();
  expect((await sizes(page)).body).toBe(16);
});

for (const theme of ['light', 'dark']) {
  test(`Appearance cannot change document style metrics in ${theme} mode`, async ({ page }) => {
    await start(page, theme);
    await page.getByTestId('document-style-select').selectOption('typora-newsprint');
    const before = await sizes(page);
    await page.getByRole('button', { name: 'Appearance', exact: true }).click();
    await page.getByRole('button', { name: 'Minimal', exact: true }).click();
    expect(await sizes(page)).toEqual(before);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.setViewportSize({ width: 600, height: 900 });
    expect((await sizes(page)).width).toBeLessThan(680);
    expect(await page.locator('.editor-pane.active .editor-container').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}

test('settings and Current Editor PDF screenshots reflect the active style', async ({ page }) => {
  await start(page);
  await mkdir('output/playwright/document-style-review', { recursive: true });
  await page.screenshot({ path: 'output/playwright/document-style-review/editor-settings.png' });
  await page.getByTestId('document-overrides').locator('summary').click();
  await range(page, 'fontSize', 20);
  await page.screenshot({ path: 'output/playwright/document-style-review/editor-overrides.png' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/document-style-review/editor-document.png' });
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  await expect(page.getByTestId('pdf-preset-select')).toHaveValue('builtin-current-editor');
  const preview = page.frameLocator('iframe');
  await expect(preview.locator('.document-root h1')).toHaveText('Document title');
  expect(await preview.locator('.document-root h1').evaluate(el => getComputedStyle(el).fontSize)).toBe('40px');
  await page.screenshot({ path: 'output/playwright/document-style-review/current-editor-pdf.png' });
});

test('line numbers stay outside the text column and code colors follow Code settings', async ({ page }) => {
  await start(page);
  await page.locator('.setting-row').filter({ has: page.getByText('Line numbers', { exact: true }) }).getByRole('button', { name: 'On', exact: true }).click();
  expect((await sizes(page)).width).toBeCloseTo(680, 0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.editor-pane.active .editor-gutter-line').first()).toBeVisible();
  const boxes = await page.locator('.editor-pane.active').evaluate(pane => ({ gutter: pane.querySelector('.editor-gutter')!.getBoundingClientRect().right, text: pane.querySelector('.tiptap')!.getBoundingClientRect().left }));
  expect(boxes.gutter).toBeLessThanOrEqual(boxes.text);
  await page.locator('.settings-btn').click();
  await page.locator('.settings-tabs').getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  expect((await sizes(page)).codeBg).toBe('rgb(15, 23, 42)');
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  expect((await sizes(page)).codeBg).toBe('rgb(248, 250, 252)');
});

test('PDF mirrors the style hierarchy, spacing and code palette for every style and excludes zoom', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mermark-editor-zoom', '150'));
  await start(page);
  for (const id of ['github','obsidian-default','obsidian-minimal','typora-github','typora-newsprint','ia-helvetica','ia-palatino']) {
    await page.getByTestId('document-style-select').selectOption(id);
    const editor = await page.locator(main).evaluate(root => {
      const css = (el: Element) => { const c = getComputedStyle(el); return { font: c.fontFamily, size: c.fontSize, line: c.lineHeight, gap: c.marginBottom, style: c.fontStyle, caps: c.fontVariantCaps, transform: c.textTransform, color: c.color }; };
      return { p: css(root.querySelector('p')!), h5: css(root.querySelector('h5')!), pre: css(root.querySelector('pre')!) };
    });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    const pdf = page.frameLocator('iframe').locator('.document-root');
    await expect(pdf).toHaveAttribute('data-document-style', id);
    const exported = await pdf.evaluate(root => {
      const css = (el: Element) => { const c = getComputedStyle(el); return { font: c.fontFamily, size: c.fontSize, line: c.lineHeight, gap: c.marginBottom, style: c.fontStyle, caps: c.fontVariantCaps, transform: c.textTransform, color: c.color }; };
      return { p: css(root.querySelector('p')!), h5: css(root.querySelector('h5')!), pre: css(root.querySelector('pre')!) };
    });
    expect(exported).toEqual(editor);
    expect(await pdf.evaluate(el => getComputedStyle(el).zoom)).toBe('1');
    await page.getByTestId('pdf-close').click();
    await page.locator('.settings-btn').click();
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
  }
});
