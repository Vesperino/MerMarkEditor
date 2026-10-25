import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

const file = (path: string) => ({ path, name: path.split('/').pop(), kind: 'file' });
const tree = {
  path: '/ws', name: 'ws', kind: 'folder', children: [
    { path: '/ws/docs', name: 'docs', kind: 'folder', children: [file('/ws/docs/a.md')] },
    file('/ws/b.md'),
    file('/ws/c.md'),
  ],
};

test('file tree is keyboard navigable and keeps focus across the rename dialog', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      workspace: { openWorkspaces: [{ id: 'ws', rootPath: '/ws', name: 'ws' }], activeWorkspaceId: 'ws', recentRoots: [], sidebarVisible: true },
      ai: { hasSeenFirstRun: true },
    }));
  });
  await setupTauriMocks(page, { initialFs: { '/ws/b.md': '# B\n' } });
  await page.addInitScript((workspaceTree) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    const invoke = internals.invoke.bind(internals);
    internals.invoke = (cmd: string, args: unknown, options: unknown) =>
      cmd === 'read_workspace_tree' ? Promise.resolve(workspaceTree) : invoke(cmd, args, options);
  }, tree);
  await page.goto('/');

  const row = (path: string) => page.locator(`.tree-row[data-tree-path="${path}"]`);
  await expect(row('/ws/docs/a.md')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('tree', { name: 'ws' })).toBeVisible();
  await expect(page.locator('.tree-row[tabindex="0"]')).toHaveCount(1);

  await row('/ws/b.md').click();
  await expect(row('/ws/b.md')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(row('/ws/docs/a.md')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row('/ws/docs')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(row('/ws/docs')).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(row('/ws/b.md')).toBeFocused();
  await expect(row('/ws/b.md')).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('F2');
  await expect(page.locator('.wid-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.wid-input')).toHaveCount(0);
  await expect(row('/ws/b.md')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('.tab-bar .tab')).toContainText('b.md', { timeout: 8_000 });
});
