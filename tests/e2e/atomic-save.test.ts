import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

// ============================================================
// Test suite: Atomic Save & Code View Save (#28)
// ============================================================

const SAMPLE_MD = '# Hello World\n\nThis is a test file.\n';
const SAMPLE_PATH = '/test/hello.md';
const SAVE_PATH = '/test/saved.md';

/** Wait for the tab bar to show a specific file name */
async function waitForTab(page: import('@playwright/test').Page, fileName: string) {
  await expect(page.locator('.tab-bar .tab')).toContainText(fileName, { timeout: 8_000 });
}

/** Override save dialog mock to return a specific path, then press Ctrl+Shift+S */
async function saveAs(page: import('@playwright/test').Page, savePath: string) {
  await page.evaluate((path) => {
    (window as Record<string, unknown>).__mockDialogSavePath = path;
  }, savePath);
  await page.keyboard.press('Control+Shift+s');
  await page.waitForTimeout(1_000);
}

// ============================================================

test.describe('Atomic Save — write .tmp → rename', () => {
  test('saves via .tmp file that is then renamed to final path', async ({ page }) => {
    const { getFs, getCalls } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    // Use Save As (always saves regardless of hasChanges flag)
    await saveAs(page, SAVE_PATH);

    const calls = getCalls();
    const writeCalls = calls.filter(c => c.cmd === 'write');
    const renameCalls = calls.filter(c => c.cmd === 'rename');

    // Must write to .tmp first
    const tmpWrite = writeCalls.find(c => (c.args as { path: string }).path.endsWith('.tmp'));
    expect(tmpWrite, 'Should write to .tmp file first').toBeTruthy();

    // Then rename .tmp → final path
    const renameOp = renameCalls.find(c => {
      const a = c.args as { from: string; to: string };
      return a.from?.endsWith('.tmp') && a.to === SAVE_PATH;
    });
    expect(renameOp, 'Should rename .tmp to final path').toBeTruthy();

    // Final file must have content
    const finalFs = getFs();
    expect(finalFs[SAVE_PATH]).toBeTruthy();
    expect(finalFs[SAVE_PATH].length).toBeGreaterThan(0);
  });

  test('no .tmp leftover on disk after successful save', async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();
    const tmpFiles = Object.keys(finalFs).filter(k => k.endsWith('.tmp'));
    expect(tmpFiles, 'No .tmp files should remain after successful save').toHaveLength(0);
  });

  test('saved file content is not empty after Save As', async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();
    expect(finalFs[SAVE_PATH], 'Saved file should exist').toBeDefined();
    expect(finalFs[SAVE_PATH].length, 'Saved file must not be empty').toBeGreaterThan(0);
    // Should contain actual markdown content, not empty or garbage
    expect(finalFs[SAVE_PATH]).toContain('Hello World');
  });
});

// ============================================================

test.describe('Code View Save — no 0KB bug (#28)', () => {
  test('saves non-empty content when editing in code view', async ({ page }) => {
    const newContent = '# Modified in Code View\n\nContent added via code view.\n';
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    // Switch to code view
    await page.locator('button[title="Code"]').click();

    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300); // Let Vue reactivity set initial content

    // Fill with new content and trigger input event
    await codeEditor.fill(newContent);
    await codeEditor.dispatchEvent('input');
    await page.waitForTimeout(300);

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();

    // The file must NOT be empty/0KB — this was the original bug
    expect(finalFs[SAVE_PATH], 'Saved file should exist').toBeDefined();
    expect(
      finalFs[SAVE_PATH].length,
      'Saved file must not be 0KB (code view save bug #28)',
    ).toBeGreaterThan(0);
    expect(finalFs[SAVE_PATH]).toContain('Modified in Code View');
  });

  test('saved content from code view matches exactly what was typed', async ({ page }) => {
    const expectedContent = '# My Document\n\nSome content here.\n';

    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    await page.locator('button[title="Code"]').click();

    const codeEditor = page.locator('textarea.code-editor');
    await expect(codeEditor).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);

    await codeEditor.fill(expectedContent);
    await codeEditor.dispatchEvent('input');
    await page.waitForTimeout(300);

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();
    // The saved file should contain exactly what we typed (raw markdown, no HTML conversion)
    expect(finalFs[SAVE_PATH]).toBe(expectedContent);
  });

  test('code view does not save empty file (regression test for 0KB bug)', async ({ page }) => {
    // This is the core regression test: before the fix, saving in code view
    // would result in a 0KB file because the HTML editor was unmounted.
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    // Switch to code view WITHOUT editing — save the original content
    await page.locator('button[title="Code"]').click();
    await expect(page.locator('textarea.code-editor')).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(300);

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();
    // Before fix: file was 0 bytes. After fix: file has actual markdown content.
    expect(finalFs[SAVE_PATH], 'File should exist after save').toBeDefined();
    expect(
      finalFs[SAVE_PATH].trim().length,
      'File must not be 0KB — regression test for #28',
    ).toBeGreaterThan(0);
  });
});

// ============================================================

test.describe('Save As', () => {
  test('Ctrl+Shift+S saves to a new path from dialog', async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    await saveAs(page, SAVE_PATH);

    const finalFs = getFs();
    expect(finalFs[SAVE_PATH], 'File should be saved to new path').toBeDefined();
    expect(finalFs[SAVE_PATH].length).toBeGreaterThan(0);
  });

  test('Ctrl+Shift+S with dialog cancelled does not write file', async ({ page }) => {
    const { getFs } = await setupTauriMocks(page, {
      initialFs: { [SAMPLE_PATH]: SAMPLE_MD },
      openFilePath: SAMPLE_PATH,
    });

    await page.goto('/');
    await page.waitForSelector('.tab-bar', { timeout: 10_000 });
    await waitForTab(page, 'hello.md');

    // Dialog returns null (user cancelled)
    await page.evaluate(() => {
      (window as Record<string, unknown>).__mockDialogSavePath = null;
    });

    await page.keyboard.press('Control+Shift+s');
    await page.waitForTimeout(500);

    const finalFs = getFs();
    // Only original file should exist
    expect(Object.keys(finalFs)).toEqual([SAMPLE_PATH]);
  });
});
