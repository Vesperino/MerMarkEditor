import { expect, test, type Page } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

async function openBlankDocument(page: Page) {
  await page.setViewportSize({ width: 1197, height: 797 });
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      ai: { enabled: true, hasSeenFirstRun: true, panelSide: 'right' },
    }));
  });
  await setupTauriMocks(page);
  await page.goto('/');
  await expect(page.locator('.editor-pane.active .editor-content-wrapper')).toBeVisible({ timeout: 10_000 });
}

async function verticalOverflow(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
}

test('blank document has no vertical scrollbar', async ({ page }) => {
  await openBlankDocument(page);

  const tabBar = await verticalOverflow(page, '.editor-pane.active .tab-bar');
  const editor = await verticalOverflow(page, '.editor-pane.active .editor-container');
  expect(tabBar.overflowY).toBe('hidden');
  expect(editor.scrollHeight).toBe(editor.clientHeight);

  const writingSurfaceHeight = await page.locator('.editor-pane.active .tiptap').evaluate(
    (element) => element.clientHeight,
  );
  expect(writingSurfaceHeight).toBeGreaterThan(400);
});

test('long document still scrolls in the document area', async ({ page }) => {
  await openBlankDocument(page);
  await page.locator('.editor-pane.active .tiptap').fill(
    Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`).join('\n'),
  );

  const editor = await verticalOverflow(page, '.editor-pane.active .editor-container');
  expect(editor.overflowY).toBe('auto');
  expect(editor.scrollHeight).toBeGreaterThan(editor.clientHeight);
});
