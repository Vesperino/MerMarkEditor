import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

// ============================================================
// Test suite: File Watcher — external change detection (#22)
// ============================================================

const SAMPLE_MD = '# Original Content\n\nThis is the original file.\n';
const UPDATED_MD = '# Updated Externally\n\nThis content was changed by another editor.\n';
const SAMPLE_PATH = '/test/watched.md';
const SAVE_PATH = '/test/saved-watched.md';

/** Wait for the tab bar to show a specific file name */
async function waitForTab(page: import('@playwright/test').Page, fileName: string) {
  await expect(page.locator('.tab-bar .tab')).toContainText(fileName, { timeout: 8_000 });
}

/** Save As via Ctrl+Shift+S with a given path */
async function saveAs(page: import('@playwright/test').Page, savePath: string) {
  await page.evaluate((path) => {
    (window as Record<string, unknown>).__mockDialogSavePath = path;
  }, savePath);
  await page.keyboard.press('Control+Shift+s');
  await page.waitForTimeout(1_000);
}

// ============================================================

test.describe('File Watcher — silent reload (no local changes)', () => {
  test('external change with no local edits triggers silent reload toast', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');

    // Give the watcher time to register
    await page.waitForTimeout(500);

    // External editor modifies the file
    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);

    // App should show a toast notification (silent reload — no local changes)
    await expect(page.locator('.toast-notification')).toBeVisible({ timeout: 5_000 });

    // Conflict modal must NOT appear (no local changes)
    await expect(page.locator('.file-conflict-modal')).not.toBeVisible();
  });

  test('after silent reload, editor shows the externally updated content', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);

    // Wait for toast (confirms reload happened)
    await expect(page.locator('.toast-notification')).toBeVisible({ timeout: 5_000 });
    await page.waitForTimeout(300); // let Vue reactivity settle

    // Switch to code view to inspect raw markdown content
    await page.locator('button[title="Code"]').click();
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });

    const content = await codeEditor.inputValue();
    expect(content).toContain('Updated Externally');
  });
});

// ============================================================

test.describe('File Watcher — conflict modal (with local changes)', () => {
  test('external change with local edits shows conflict modal', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    // Make a local edit (type something in code view)
    await page.locator('button[title="Code"]').click();
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);
    await codeEditor.fill('# My Local Changes\n\nI typed this locally.\n');
    await codeEditor.dispatchEvent('input');
    await page.waitForTimeout(300);

    // External editor also changes the file
    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);

    // Conflict modal MUST appear
    await expect(page.locator('.file-conflict-modal')).toBeVisible({ timeout: 5_000 });
    // Toast must NOT appear (conflict modal takes priority)
    await expect(page.locator('.toast-notification')).not.toBeVisible();
  });

  test('"Load External Version" replaces editor content with disk version', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    // Local edit
    await page.locator('button[title="Code"]').click();
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);
    await codeEditor.fill('# My Local Changes\n\nI typed this locally.\n');
    await codeEditor.dispatchEvent('input');
    await page.waitForTimeout(300);

    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);
    await expect(page.locator('.file-conflict-modal')).toBeVisible({ timeout: 5_000 });

    // Click "Load External Version"
    await page.locator('.file-conflict-modal button').filter({ hasText: /load external/i }).click();
    await page.waitForTimeout(300);

    // Modal should close
    await expect(page.locator('.file-conflict-modal')).not.toBeVisible();

    // Editor should now show disk content
    const content = await codeEditor.inputValue();
    expect(content).toContain('Updated Externally');
  });

  test('"Keep My Changes" closes modal and preserves local content', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    await page.locator('button[title="Code"]').click();
    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);
    await codeEditor.fill('# My Local Changes\n\nI typed this locally.\n');
    await codeEditor.dispatchEvent('input');
    await page.waitForTimeout(300);

    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);
    await expect(page.locator('.file-conflict-modal')).toBeVisible({ timeout: 5_000 });

    // Click "Keep My Changes"
    await page.locator('.file-conflict-modal button').filter({ hasText: /keep my changes/i }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('.file-conflict-modal')).not.toBeVisible();

    const content = await codeEditor.inputValue();
    expect(content).toContain('My Local Changes');
    expect(content).not.toContain('Updated Externally');
  });
});

// ============================================================

test.describe('File Watcher — own-save grace period regression', () => {
  /**
   * Regression test for the false-positive own-save detection bug:
   *
   * Before the fix, useFileWatcher had a 2-second "recentOwnSaves" grace period.
   * Any external change arriving within 2s of OUR save was silently ignored,
   * even when it was a DIFFERENT change from a DIFFERENT editor.
   *
   * After the fix: only events during the literal in-progress save window
   * (markSaveStart → markSaveEnd) are skipped. Content comparison handles
   * spurious post-save events from our own rename.
   */
  test('external change immediately after own save is detected (no false-positive)', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    // 1. Save our own copy (triggers markSaveStart → markSaveEnd)
    await saveAs(page, SAVE_PATH);

    // 2. Immediately (well within old 2s grace period) simulate external change
    //    to the ORIGINAL file from another editor with DIFFERENT content
    await triggerExternalChange(SAMPLE_PATH, UPDATED_MD);

    // 3. The app has no local edits to SAMPLE_PATH (we saved to SAVE_PATH),
    //    so it should silently reload and show a toast — NOT ignore the event.
    await expect(page.locator('.toast-notification')).toBeVisible({ timeout: 5_000 });
  });

  test('own save does not trigger a false external-change reload', async ({ page }) => {
    const { triggerExternalChange: _ } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    // Save to the same path (own save) — should NOT trigger conflict or reload
    await page.evaluate((path) => {
      (window as Record<string, unknown>).__mockDialogSavePath = path;
    }, SAMPLE_PATH);
    await page.keyboard.press('Control+Shift+s');
    await page.waitForTimeout(1_500);

    // No toast, no conflict modal — own save should be transparent
    await expect(page.locator('.file-conflict-modal')).not.toBeVisible();
    // Toast from own save is not expected (only external changes show toast)
    await expect(page.locator('.toast-notification')).not.toBeVisible();
  });

  test('spurious post-save watcher event (same content) is silently ignored', async ({ page }) => {
    const { triggerExternalChange } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'watched.md');
    await page.waitForTimeout(500);

    // Trigger a watcher event with the SAME content — should be a no-op
    await triggerExternalChange(SAMPLE_PATH, SAMPLE_MD);

    // Nothing should happen
    await page.waitForTimeout(500);
    await expect(page.locator('.toast-notification')).not.toBeVisible();
    await expect(page.locator('.file-conflict-modal')).not.toBeVisible();
  });
});
