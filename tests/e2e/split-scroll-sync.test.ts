import { expect, test } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

test('code and preview panes scroll together in the split editor', async ({ page }) => {
  await page.setViewportSize({ width: 1197, height: 797 });
  await setupTauriMocks(page);
  await page.goto('/');
  await expect(page.locator('.editor-pane.active .tiptap')).toBeVisible({ timeout: 10_000 });
  await page.locator('.editor-pane.active .tiptap').fill(
    Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join('\n'),
  );
  await page.locator('.split-editor-toggle-btn').first().click();

  const code = page.locator('.split-editor-code .cm-scroller');
  const preview = page.locator('.split-editor-preview .editor-container');
  await expect(code).toBeVisible();
  const ratio = (el: Element) => el.scrollTop / (el.scrollHeight - el.clientHeight);

  await code.hover();
  await page.mouse.wheel(0, 2000);
  await expect.poll(() => preview.evaluate(ratio)).toBeGreaterThan(0.1);
  expect(Math.abs(await preview.evaluate(ratio) - await code.evaluate(ratio))).toBeLessThan(0.05);

  const codeBefore = await code.evaluate(ratio);
  await preview.hover();
  await page.mouse.wheel(0, -1000);
  await expect.poll(() => code.evaluate(ratio)).toBeLessThan(codeBefore - 0.05);
  await expect.poll(async () => Math.abs(await code.evaluate(ratio) - await preview.evaluate(ratio))).toBeLessThan(0.05);
});

test('opening and closing Code + Preview preserves the reading position', async ({ page }) => {
  await page.setViewportSize({ width: 1197, height: 797 });
  await setupTauriMocks(page);
  await page.goto('/');

  const visual = page.locator('.editor-pane.active .editor-container');
  await expect(visual.locator('.tiptap')).toBeVisible({ timeout: 10_000 });
  await visual.locator('.tiptap').fill(
    Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join('\n'),
  );

  const ratio = (el: Element) => el.scrollTop / (el.scrollHeight - el.clientHeight);
  await visual.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.55;
  });

  await page.locator('.split-editor-toggle-btn').first().click();
  const code = page.locator('.split-editor-code .cm-scroller');
  const preview = page.locator('.split-editor-preview .editor-container');
  await expect(code).toBeVisible();
  await expect.poll(async () => Math.abs(await code.evaluate(ratio) - 0.55)).toBeLessThan(0.1);
  await expect.poll(async () => Math.abs(await preview.evaluate(ratio) - 0.55)).toBeLessThan(0.1);

  // Scroll to a different position inside Code + Preview and verify Visual
  // restores that updated position rather than the pre-entry position.
  await preview.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => preview.evaluate(ratio)).toBeGreaterThan(0.7);
  const exitRatio = await preview.evaluate(ratio);

  await page.locator('.split-editor-toggle-btn').first().click();
  await expect(visual).toBeVisible();
  await expect.poll(async () => Math.abs(await visual.evaluate(ratio) - exitRatio)).toBeLessThan(0.1);
});

test('opening Code + Preview from Code view preserves the reading position', async ({ page }) => {
  await page.setViewportSize({ width: 1197, height: 797 });
  await setupTauriMocks(page);
  await page.goto('/');

  const visual = page.locator('.editor-pane.active .editor-container');
  await expect(visual.locator('.tiptap')).toBeVisible({ timeout: 10_000 });
  await visual.locator('.tiptap').fill(
    Array.from({ length: 200 }, (_, index) => `Line ${index + 1}`).join('\n'),
  );

  const ratio = (el: Element) => el.scrollTop / (el.scrollHeight - el.clientHeight);
  await page.locator('.code-toggle-btn').first().click();
  const codeOnly = page.locator('.code-view-area .cm-scroller');
  await expect(codeOnly).toBeVisible();
  // Wait for useCodeView's post-switch highlight lock (100ms) to clear before switching views.
  await page.waitForTimeout(200);
  await codeOnly.evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.6;
  });

  await page.locator('.split-editor-toggle-btn').first().click();
  const code = page.locator('.split-editor-code .cm-scroller');
  const preview = page.locator('.split-editor-preview .editor-container');
  await expect(code).toBeVisible();
  await expect.poll(async () => Math.abs(await code.evaluate(ratio) - 0.6)).toBeLessThan(0.1);
  await expect.poll(async () => Math.abs(await preview.evaluate(ratio) - 0.6)).toBeLessThan(0.1);
});
