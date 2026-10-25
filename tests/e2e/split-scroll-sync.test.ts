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
