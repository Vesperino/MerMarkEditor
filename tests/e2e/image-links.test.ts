import { test, expect, type Locator } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';
import { fillCodeEditor } from './helpers/code-editor';

const documentPath = '/project/notes/readme.md';
const screenshotPath = '/project/assets/screen shot.PNG';
const logoPath = '/project/notes/logo.png';
const onlineImageUrl = 'https://example.com/logo.png?size=1';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XkAAAAASUVORK5CYII=', 'base64');

async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1);
}

test('a linked image opens in a read-only editor tab and can be reopened or closed', async ({ page }) => {
  const markdown = '# Project notes\n\n[Screenshot](../assets/screen%20shot.PNG)';
  const { getCalls, getFs } = await setupTauriMocks(page, {
    openFilePath: documentPath,
    initialFs: { [documentPath]: markdown },
    binaryFiles: { [screenshotPath]: [...png] },
  });
  await page.goto('/');

  const pane = page.locator('.editor-pane');
  const preview = pane.locator('.image-preview-pane');
  const screenshotLink = pane.getByRole('link', { name: 'Screenshot', exact: true });
  const tabNames = pane.locator('.tab-name');
  const documentTab = pane.locator('.tab').filter({ hasText: 'readme.md' });
  const imageTab = pane.locator('.tab').filter({ hasText: 'screen shot.PNG' });
  const activeTab = pane.locator('.tab.active');
  const image = preview.getByRole('img', { name: 'screen shot.PNG' });

  await screenshotLink.click();
  await expect(tabNames).toHaveText(['readme.md', 'screen shot.PNG']);
  await expect(activeTab.locator('.tab-name')).toHaveText('screen shot.PNG');
  await expectImageLoaded(image);
  await expect(pane.locator('[contenteditable="true"]')).not.toBeVisible();
  await expect(page.locator('.image-preview-overlay')).toHaveCount(0);

  await page.evaluate(() => {
    (window as Record<string, unknown>).__mockDialogSavePath = '/project/notes/image-copy.md';
  });
  await page.keyboard.press('ControlOrMeta+s');
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect(activeTab.locator('.tab-name')).toHaveText('screen shot.PNG');

  await documentTab.click();
  await expect(screenshotLink).toBeVisible();
  await expect(preview).not.toBeVisible();
  await imageTab.click();
  await expectImageLoaded(image);

  await documentTab.click();
  await screenshotLink.click();
  await expect(tabNames).toHaveText(['readme.md', 'screen shot.PNG']);
  await expect(activeTab.locator('.tab-name')).toHaveText('screen shot.PNG');
  await expectImageLoaded(image);

  await activeTab.locator('.tab-close').click();
  await expect(tabNames).toHaveText(['readme.md']);
  await expect(preview).not.toBeVisible();
  await expect(screenshotLink).toBeVisible();

  const calls = getCalls();
  expect(calls).not.toContainEqual({ cmd: 'read', args: screenshotPath });
  expect(calls.filter(call => ['write', 'rename', 'dialogSave'].includes(call.cmd))).toEqual([]);
  expect(getFs()).toEqual({ [documentPath]: markdown });
});

test('image tabs load local and remote links and show a missing-image message', async ({ page }) => {
  const markdown = [
    '[Logo](logo.png)',
    '[Missing](missing.png)',
    `[Online image](${onlineImageUrl})`,
  ].join('\n\n');
  await setupTauriMocks(page, {
    openFilePath: documentPath,
    initialFs: { [documentPath]: markdown },
    binaryFiles: { [logoPath]: [...png] },
  });
  await page.route(onlineImageUrl, route =>
    route.fulfill({ contentType: 'image/png', body: png }));
  await page.goto('/');

  const pane = page.locator('.editor-pane');
  const preview = pane.locator('.image-preview-pane');
  const activeTab = pane.locator('.tab.active');

  for (const name of ['Logo', 'Online image']) {
    await pane.getByRole('link', { name, exact: true }).click();
    await expectImageLoaded(preview.getByRole('img'));
    await activeTab.locator('.tab-close').click();
    await expect(pane.locator('.tab-name')).toHaveText(['readme.md']);
  }

  await pane.getByRole('link', { name: 'Missing', exact: true }).click();
  await expect(activeTab.locator('.tab-name')).toHaveText('missing.png');
  await expect(preview.getByRole('status')).toHaveText('Could not load image.');
  await activeTab.locator('.tab-close').click();
  await expect(pane.locator('.tab-name')).toHaveText(['readme.md']);
});

test('double-clicking a workspace image opens and reuses its preview tab', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      workspace: {
        openWorkspaces: [{ id: 'notes', rootPath: '/project/notes', name: 'Notes' }],
        activeWorkspaceId: 'notes', sidebarVisible: true,
      },
      ai: { hasSeenFirstRun: true },
    }));
  });
  await setupTauriMocks(page, {
    openFilePath: documentPath,
    initialFs: { [documentPath]: '# Notes' },
    binaryFiles: { [logoPath]: [...png] },
    commands: { read_workspace_tree: {
      path: '/project/notes', name: 'Notes', kind: 'folder',
      children: [{ path: logoPath, name: 'logo.png', kind: 'file' }],
    } },
  });
  await page.goto('/');
  const row = page.locator(`.tree-row[data-tree-path="${logoPath}"]`);
  const tabNames = page.locator('.editor-pane .tab-name');
  await expect(tabNames).toHaveText(['readme.md']);
  await row.click();
  await expect(tabNames).toHaveText(['readme.md']);
  await row.dblclick();
  await expectImageLoaded(page.locator('.image-preview-pane').getByRole('img', { name: 'logo.png' }));
  await page.locator('.tab').filter({ hasText: 'readme.md' }).click();
  await row.dblclick();
  await expect(page.locator('.tab.active .tab-name')).toHaveText('logo.png');
  await expect(tabNames).toHaveText(['readme.md', 'logo.png']);
});

test('a local image opened at startup uses the read-only image viewer', async ({ page }) => {
  const { getCalls } = await setupTauriMocks(page, {
    openFilePath: screenshotPath,
    binaryFiles: { [screenshotPath]: [...png] },
  });
  await page.goto('/');

  const pane = page.locator('.editor-pane');
  await expect(pane.locator('.tab-name')).toHaveText(['screen shot.PNG']);
  await expectImageLoaded(pane.locator('.image-preview-pane').getByRole('img', { name: 'screen shot.PNG' }));
  await expect(pane.locator('[contenteditable="true"]')).not.toBeVisible();
  const calls = getCalls();
  expect(calls).not.toContainEqual({ cmd: 'read', args: screenshotPath });
  expect(calls).toContainEqual({ cmd: 'readBinary', args: screenshotPath });
});

test('opening an image from Code + Preview preserves unsaved Markdown edits', async ({ page }) => {
  const { getFs } = await setupTauriMocks(page, {
    openFilePath: documentPath,
    initialFs: { [documentPath]: '# Notes' },
    binaryFiles: { [logoPath]: [...png] },
  });
  await page.goto('/');
  await expect(page.locator('.tab-name')).toHaveText('readme.md');
  await page.getByRole('button', { name: 'Code + Preview', exact: true }).click();
  const draft = '# Edited notes\n\n[Logo](logo.png)';
  await fillCodeEditor(page, draft);
  await page.locator('.split-editor-preview').getByRole('link', { name: 'Logo' }).click();
  await expectImageLoaded(page.locator('.image-preview-pane img'));
  await page.locator('.tab').filter({ hasText: 'readme.md' }).click();
  await expect(page.getByRole('heading', { name: 'Edited notes' })).toBeVisible();
  await expect(page.locator('.tab.active .tab-unsaved')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => getFs()[documentPath].trimEnd()).toBe(draft);
});
