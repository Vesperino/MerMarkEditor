import { expect, test } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

test('saving Markdown with quoted image targets cannot execute attributes', async ({ page }) => {
  const path = '/test/quoted-image.md';
  const source = '# Image\n\n![a](x.png" onerror="window.__saveSecurity=1)\n';
  const { getFs } = await setupTauriMocks(page, { initialFs: { [path]: source }, openFilePath: path });
  await page.goto('/');
  await expect(page.locator('.tab-bar .tab')).toContainText('quoted-image.md');
  await expect(page.locator('.ProseMirror img')).toHaveCount(1);
  expect(await page.locator('.ProseMirror img').getAttribute('onerror')).toBeNull();
  await page.evaluate(() => { (window as any).__mockDialogSavePath = '/test/quoted-copy.md'; });
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect.poll(() => getFs()['/test/quoted-copy.md']).toBe(source);
  expect(await page.evaluate(() => (window as any).__saveSecurity)).toBeUndefined();
});

test('visual normalization does not execute image handlers in its input', async ({ page }) => {
  await setupTauriMocks(page);
  await page.goto('/');
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await page.route('**/normalization-probe.png', route => route.fulfill({ status: 404, body: '' }));
  await page.evaluate(async () => {
    const url = '/src/utils/source-preserving-markdown.ts';
    const { sourcePreservingMarkdown } = await import(/* @vite-ignore */ url);
    sourcePreservingMarkdown('<p>text<img src="/normalization-probe.png" onerror="window.__saveSecurity=1"></p>', 'text\n');
  });
  // Image load/error events are asynchronous, including on detached elements.
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => (window as any).__saveSecurity)).toBeUndefined();
});
