import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

// ============================================================
// Test suite: Large file open (#129)
// Files above LARGE_FILE_CHAR_THRESHOLD (1M chars) must open
// markdown-first: straight into section-virtualized visual editing, without
// converting or mounting the complete document in a single TipTap instance.
// ============================================================

const CHUNK = [
  '# Section header',
  '',
  'A paragraph with **bold**, *italic*, `code` and a [link](https://example.com).',
  '',
  '- list item one',
  '  continuation line under the item',
  '- list item two',
  '  more continuation',
  '',
  '    indented code candidate line 1',
  '    indented code candidate line 2',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
].join('\n');

function buildLargeDoc(minChars: number): string {
  let doc = '';
  while (doc.length < minChars) doc += CHUNK;
  return doc;
}

const BIG_MD = buildLargeDoc(1_050_000);
const PATH_BIG = '/test/big.md';

test.describe('Large file open (#129)', () => {
  test('opens above-threshold file directly in editable lazy visual mode', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await expect(page.locator('.tab-bar .tab')).toContainText('big.md', { timeout: 8_000 });

    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });
    const visualChunks = page.locator('.lazy-editor .ProseMirror');
    await expect(visualChunks.first()).toBeEditable();
    await expect(visualChunks.first().locator('h1').first()).toContainText('Section header');
    expect(await visualChunks.count()).toBeLessThan(10);
  });

  test('explicit toggle opens bounded editable lazy visual mode', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });
    const visualChunks = page.locator('.lazy-editor .ProseMirror');
    await expect(visualChunks.first()).toBeEditable();
    await expect(visualChunks.first().locator('h1').first()).toContainText('Section header');
    expect(await visualChunks.count()).toBeLessThan(10);

    await page.locator('.lazy-editor').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => visualChunks.count()).toBeGreaterThan(0);
    expect(await visualChunks.count()).toBeLessThan(10);

    await page.locator('.lazy-editor').evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    const firstChunkEditor = page.locator('.lazy-editor-chunk[data-lazy-chunk="0"] .ProseMirror');
    await expect(firstChunkEditor).toBeEditable();
    await expect(firstChunkEditor.locator('h1').first()).toContainText('Section header');
    await firstChunkEditor.fill('Edited in lazy visual mode');
    await expect(firstChunkEditor).toContainText('Edited in lazy visual mode');
    await page.waitForTimeout(500);

    await page.keyboard.press('Control+Shift+V');
    const codeEditor = page.locator('.code-editor .cm-editor');
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.code-editor .cm-line').first()).toContainText('Edited in lazy visual mode');

    await page.keyboard.press('Control+Shift+V');
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.lazy-editor-chunk[data-lazy-chunk="0"] .ProseMirror')).toContainText('Edited in lazy visual mode');
  });

  test('switching tabs restores the large file in lazy visual mode', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.locator('.nf-card').first().click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('.tab-bar .tab').count()).toBeGreaterThanOrEqual(2);

    await page.locator('.tab-bar .tab', { hasText: 'big.md' }).first().click();
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.lazy-editor-chunk[data-lazy-chunk="0"] h1').first()).toContainText('Section header');
  });

  test('lazy visual mode keeps the same document width as the classic editor', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    const lazyWrapper = page.locator('.lazy-editor-chunk[data-lazy-chunk="0"] .editor-content-wrapper');
    await expect(lazyWrapper).toBeVisible({ timeout: 10_000 });
    const lazyWidth = await lazyWrapper.evaluate(element => element.getBoundingClientRect().width);

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.locator('.nf-card').first().click();
    const classicWrapper = page.locator('.editor-pane.active .editor-content-wrapper');
    await expect(classicWrapper).toBeVisible({ timeout: 10_000 });
    const classicWidth = await classicWrapper.evaluate(element => element.getBoundingClientRect().width);

    expect(Math.abs(lazyWidth - classicWidth)).toBeLessThanOrEqual(1);
  });

  test('large-file table of contents is virtualized and navigates to a lazy section', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });
    await page.locator('.toc-toggle-btn').first().click();

    const toc = page.locator('.toc-panel');
    await expect(toc).toBeVisible();
    await expect(toc.locator('.toc-item').first()).toContainText('Section header', { timeout: 10_000 });
    expect(await toc.locator('.toc-item').count()).toBeLessThan(100);

    const tocContent = toc.locator('.toc-content');
    await tocContent.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await toc.locator('.toc-item').last().click();

    await expect.poll(
      () => page.locator('.lazy-editor').evaluate(element => element.scrollTop),
      { timeout: 10_000 },
    ).toBeGreaterThan(0);
    expect(await page.locator('.lazy-editor .ProseMirror').count()).toBeLessThan(10);
  });

  // fixme: the tauri-mock watcher bridge is broken on master — every
  // tests/e2e/file-watcher.test.ts case fails there identically, so synthetic
  // watch events never reach the app. The reload logic itself is covered by
  // unit tests in src/__tests__/composables/useFileReload.test.ts
  // ("markdown-first tabs"). Re-enable once the watcher mock is repaired.
  test.fixme('external file change reloads lazy visual mode without full conversion', async ({ page }) => {
    const mocks = await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await expect(page.locator('.lazy-editor')).toBeVisible({ timeout: 10_000 });

    await mocks.triggerExternalChange(PATH_BIG, '# CHANGED EXTERNALLY\n\n' + BIG_MD);

    await expect
      .poll(async () => (await page.locator('.lazy-editor-chunk[data-lazy-chunk="0"] h1').first().textContent())?.startsWith('CHANGED EXTERNALLY'), { timeout: 10_000 })
      .toBe(true);
  });
});
