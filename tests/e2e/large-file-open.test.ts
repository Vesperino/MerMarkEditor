import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

// ============================================================
// Test suite: Large file open (#129)
// Files above LARGE_FILE_CHAR_THRESHOLD (1M chars) must open
// markdown-first: straight into code view, no HTML conversion,
// no hang. Visual editing is an explicit, user-triggered step.
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
  test('opens above-threshold file directly in code view with banner, no hang', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await expect(page.locator('.tab-bar .tab')).toContainText('big.md', { timeout: 8_000 });

    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.large-file-banner')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);

    const value = await codeEditor.inputValue();
    expect(value.startsWith('# Section header')).toBe(true);
    expect(value.length).toBeGreaterThan(1_000_000);
  });

  test('explicit toggle to visual view converts and drops the banner', async ({ page }) => {
    test.setTimeout(90_000);
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Control+Shift+V');
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.large-file-banner')).toHaveCount(0);
    await expect(page.locator('.ProseMirror h1').first()).toContainText('Section header', { timeout: 10_000 });
  });

  test('switching tabs keeps the large file markdown-first in code view', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.locator('.nf-card').first().click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 10_000 });
    expect(await page.locator('.tab-bar .tab').count()).toBeGreaterThanOrEqual(2);

    await page.locator('.tab-bar .tab', { hasText: 'big.md' }).first().click();
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.large-file-banner')).toBeVisible({ timeout: 5_000 });
    const value = await codeEditor.inputValue();
    expect(value.startsWith('# Section header')).toBe(true);
  });

  // fixme: the tauri-mock watcher bridge is broken on master — every
  // tests/e2e/file-watcher.test.ts case fails there identically, so synthetic
  // watch events never reach the app. The reload logic itself is covered by
  // unit tests in src/__tests__/composables/useFileReload.test.ts
  // ("markdown-first tabs"). Re-enable once the watcher mock is repaired.
  test.fixme('external file change reloads the code view without conversion', async ({ page }) => {
    const mocks = await setupTauriMocks(page, {
      initialFs: { [PATH_BIG]: BIG_MD },
      openFilePath: PATH_BIG,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 10_000 });

    await mocks.triggerExternalChange(PATH_BIG, '# CHANGED EXTERNALLY\n\n' + BIG_MD);

    await expect
      .poll(async () => (await codeEditor.inputValue()).startsWith('# CHANGED EXTERNALLY'), { timeout: 10_000 })
      .toBe(true);
    await expect(page.locator('.large-file-banner')).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
  });
});
