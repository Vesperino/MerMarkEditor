import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';
import {
  fillCodeEditor,
  getCodeEditorValue,
  openCodeView,
  openVisualView,
  setCodeCursor,
} from './helpers/code-editor';

// ============================================================
// Test suite: Cursor marker not injected into image/link tags (#37)
//
// Previously, switching from code view to visual view injected a
// __CURSOR__ marker into the raw markdown. If the cursor was inside
// an image tag like ![alt](url), the marker corrupted the syntax
// and invisible zero-width spaces persisted. The fix removes marker
// injection from the code→visual direction entirely.
// ============================================================

const IMAGE_MD = '# Document with image\n\nSome text before.\n\n![screenshot](https://example.com/image.png)\n\nSome text after.\n';
const SAMPLE_PATH = '/test/doc-with-image.md';

/** Wait for the tab bar to show a specific file name */
async function waitForTab(page: import('@playwright/test').Page, fileName: string) {
  await expect(page.locator('.tab-bar .tab')).toContainText(fileName, { timeout: 8_000 });
}

// ============================================================

test.describe('Cursor marker not injected into content (#37)', () => {
  test('switching code→visual with cursor inside image tag preserves image syntax', async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: IMAGE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'doc-with-image.md');

    // Switch to code view
    await openCodeView(page);
    await page.waitForTimeout(300);

    // Place cursor inside the image URL
    const content = await getCodeEditorValue(page);
    const imageUrlStart = content.indexOf('https://example.com');
    expect(imageUrlStart).toBeGreaterThan(-1);

    // Click into the textarea and set cursor position inside image URL
    await setCodeCursor(page, imageUrlStart + 5);
    await page.waitForTimeout(100);

    // Switch back to visual view
    await openVisualView(page);
    await page.waitForTimeout(500);

    // The visual editor should be visible
    const editorContent = page.locator('.ProseMirror');
    await expect(editorContent).toBeVisible({ timeout: 3_000 });

    // Switch to code view again to verify content integrity
    await openCodeView(page);
    await page.waitForTimeout(300);

    const contentAfter = await getCodeEditorValue(page);

    // Content should NOT contain __CURSOR__ marker or zero-width spaces
    expect(contentAfter).not.toContain('__CURSOR__');
    expect(contentAfter).not.toContain('\u200B');

    // Image syntax should be intact
    expect(contentAfter).toContain('![screenshot](https://example.com/image.png)');
  });

  test('switching code→visual with cursor inside link preserves link syntax', async ({ page }) => {
    const linkMd = '# Links\n\nCheck out [my website](https://example.com/page) for more.\n';
    const linkPath = '/test/doc-with-link.md';

    await setupTauriMocks(page, {
      initialFs: { [linkPath]: linkMd },
      openFilePath: linkPath,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'doc-with-link.md');

    // Switch to code view
    await openCodeView(page);
    await page.waitForTimeout(300);

    // Place cursor inside the link URL
    const content = await getCodeEditorValue(page);
    const linkUrlStart = content.indexOf('https://example.com/page');
    expect(linkUrlStart).toBeGreaterThan(-1);

    await setCodeCursor(page, linkUrlStart + 10);
    await page.waitForTimeout(100);

    // Switch back to visual view
    await openVisualView(page);
    await page.waitForTimeout(500);

    // Switch to code again and verify
    await openCodeView(page);
    await page.waitForTimeout(300);

    const contentAfter = await getCodeEditorValue(page);

    expect(contentAfter).not.toContain('__CURSOR__');
    expect(contentAfter).not.toContain('\u200B');
    expect(contentAfter).toContain('[my website](https://example.com/page)');
  });

  test('editing image path in code view and switching back preserves changes', async ({ page }) => {
    await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: IMAGE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'doc-with-image.md');

    // Switch to code view
    await openCodeView(page);
    await page.waitForTimeout(300);

    // Replace the image URL
    const content = await getCodeEditorValue(page);
    const newContent = content.replace(
      'https://example.com/image.png',
      'https://example.com/new-image.jpg'
    );
    await fillCodeEditor(page, newContent);
    await page.waitForTimeout(200);

    // Place cursor inside the new URL
    const newUrlStart = newContent.indexOf('https://example.com/new-image');
    await setCodeCursor(page, newUrlStart + 10);
    await page.waitForTimeout(100);

    // Switch to visual view (this was the buggy path - content changed + cursor in image)
    await openVisualView(page);
    await page.waitForTimeout(500);

    // Verify visual editor is shown
    const editorContent = page.locator('.ProseMirror');
    await expect(editorContent).toBeVisible({ timeout: 3_000 });

    // Switch back to code to verify content
    await openCodeView(page);
    await page.waitForTimeout(300);

    const contentAfter = await getCodeEditorValue(page);

    // No marker corruption
    expect(contentAfter).not.toContain('__CURSOR__');
    expect(contentAfter).not.toContain('\u200B');

    // Edit should be preserved
    expect(contentAfter).toContain('![screenshot](https://example.com/new-image.jpg)');
  });
});
