import { test, expect } from '@playwright/test';
import { setupTauriMocks } from './helpers/tauri-mock';

/**
 * Regression coverage for the built-in Git bar (branch dropdown, dirty/clean
 * indicator, Commit + Push). These tests drive the REAL app UI in a browser
 * against a scripted fake of the `git_*` Tauri commands — no native shell,
 * no real `git` process — so every bug reported against the feature can be
 * reproduced and locked down without a live Tauri window.
 */

const file = (path: string) => ({ path, name: path.split('/').pop(), kind: 'file' });

interface GitContext {
  repoRoot: string;
  currentBranch: string;
  branches: string[];
  trackingBranch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  operationInProgress: boolean;
}

function ctx(overrides: Partial<GitContext> = {}): GitContext {
  return {
    repoRoot: '/ws',
    currentBranch: 'dev',
    branches: ['main', 'dev'],
    trackingBranch: 'origin/dev',
    dirty: false,
    ahead: 0,
    behind: 0,
    operationInProgress: false,
    ...overrides,
  };
}

interface WorkspaceEntry { id: string; rootPath: string; name: string }

/** Seed one or more open workspaces, per-root file trees, and intercept the
 *  git_* IPC commands with a caller-supplied handler; everything else falls
 *  through to the shared mock. */
async function withGitMock(
  page: import('@playwright/test').Page,
  opts: {
    workspaces: WorkspaceEntry[];
    activeWorkspaceId: string;
    trees: Record<string, unknown>;
    initialFs: Record<string, string>;
    openFilePath: string;
    handler: (cmd: string, args: Record<string, unknown>) => unknown | Promise<unknown>;
  },
) {
  await page.addInitScript((seed: { workspaces: WorkspaceEntry[]; activeWorkspaceId: string }) => {
    localStorage.setItem('mermark-settings', JSON.stringify({
      workspace: { openWorkspaces: seed.workspaces, activeWorkspaceId: seed.activeWorkspaceId, recentRoots: [], sidebarVisible: true },
      ai: { hasSeenFirstRun: true },
    }));
  }, { workspaces: opts.workspaces, activeWorkspaceId: opts.activeWorkspaceId });
  await setupTauriMocks(page, { initialFs: opts.initialFs, openFilePath: opts.openFilePath });
  await page.exposeFunction('__gitMockHandlerBridge', opts.handler);
  await page.addInitScript((trees: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internals = (window as any).__TAURI_INTERNALS__;
    const invoke = internals.invoke.bind(internals);
    internals.invoke = (cmd: string, args: Record<string, unknown>, options: unknown) => {
      if (cmd === 'read_workspace_tree') return Promise.resolve(trees[args.root as string] ?? null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fn = (window as any).__gitMockHandlerBridge as ((cmd: string, args: Record<string, unknown>) => unknown) | undefined;
      if (cmd.startsWith('git_') && fn) return Promise.resolve(fn(cmd, args ?? {}));
      return invoke(cmd, args, options);
    };
  }, opts.trees);
}

test('branch dropdown is populated from git_get_context, not empty', async ({ page }) => {
  await withGitMock(page, {
    workspaces: [{ id: 'ws', rootPath: '/ws', name: 'ws' }],
    activeWorkspaceId: 'ws',
    trees: { '/ws': { path: '/ws', name: 'ws', kind: 'folder', children: [file('/ws/b.md')] } },
    initialFs: { '/ws/b.md': '# B\n' },
    openFilePath: '/ws/b.md',
    handler: (cmd) => {
      if (cmd === 'git_get_context') return ctx();
      if (cmd === 'git_sync') return { state: ctx(), fetched: true, pulled: false, message: 'Fetched remote updates.' };
      return null;
    },
  });
  await page.goto('/');

  const select = page.locator('.ws-git-branch');
  await expect(select).toBeVisible({ timeout: 10_000 });
  await expect(select.locator('option')).toHaveCount(2);
  await expect(select.locator('option')).toHaveText(['main', 'dev']);
  await expect(select).toHaveValue('dev');
});

test('commit button is disabled while a status check is in flight, and does not get reverted by a late-arriving stale check', async ({ page }) => {
  let getContextCalls = 0;
  let releaseSlowCall: (() => void) | null = null;

  await withGitMock(page, {
    workspaces: [{ id: 'ws', rootPath: '/ws', name: 'ws' }],
    activeWorkspaceId: 'ws',
    trees: { '/ws': { path: '/ws', name: 'ws', kind: 'folder', children: [file('/ws/b.md')] } },
    initialFs: { '/ws/b.md': '# B\n' },
    openFilePath: '/ws/b.md',
    handler: (cmd) => {
      if (cmd === 'git_get_context') {
        getContextCalls++;
        if (getContextCalls === 1) {
          // Initial mount load — resolves immediately, repo starts clean.
          return ctx({ dirty: false });
        }
        if (getContextCalls === 2) {
          // The post-save debounce check: artificially slow, and reports the
          // (correct, pre-commit) dirty state. In the original bug this result
          // would land AFTER the commit and silently revert the UI to "dirty".
          return new Promise((resolve) => {
            releaseSlowCall = () => resolve(ctx({ dirty: true }));
          });
        }
        // Call #3+: the post-commit re-verification — resolves immediately
        // with the real, authoritative clean state.
        return ctx({ dirty: false });
      }
      if (cmd === 'git_sync') return { state: ctx({ dirty: false }), fetched: true, pulled: false, message: 'Fetched remote updates.' };
      if (cmd === 'git_commit_and_push') return ctx({ dirty: false });
      return null;
    },
  });
  await page.goto('/');

  const commitBtn = page.getByRole('button', { name: 'Commit + Push' });
  const status = page.locator('.ws-git-state');
  await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
  await expect(status).toContainText('No local changes');

  // Make a real edit and save it — this is the actual production trigger
  // (onAfterSave → notifyFileSaved → 400ms debounce → loadGitContext),
  // not a synthetic hook into internals.
  await expect(page.locator('.ProseMirror')).toContainText('B', { timeout: 10_000 });
  // Initial App loading deliberately suppresses dirty events for 200ms.
  await page.waitForTimeout(250);
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('!');
  await expect(page.locator('.tab.active .tab-unsaved')).toBeVisible({ timeout: 2_000 });
  await page.keyboard.press('ControlOrMeta+s');

  // The debounced background check should now be in flight (gitBusy=true),
  // which must disable Commit + Push — this is what prevents the race from
  // ever being observable, instead of merely hiding it.
  await expect(commitBtn).toBeDisabled({ timeout: 2_000 });

  // Commit becomes possible again once the slow check resolves and reports
  // the real pre-commit dirty state.
  expect(releaseSlowCall).not.toBeNull();
  releaseSlowCall!();
  await expect(commitBtn).toBeEnabled({ timeout: 2_000 });
  await expect(status).toContainText('Local changes');

  await commitBtn.click();
  await page.locator('.wid-input').fill('test commit');
  await page.locator('.wid-btn-primary', { hasText: 'Commit + Push' }).click();

  await expect(status).toContainText('No local changes', { timeout: 2_000 });
  // Give any further stray async handler a chance to run, then confirm the
  // clean state actually stuck (the original bug would flip back here).
  await page.waitForTimeout(500);
  await expect(status).toContainText('No local changes');
});

test('a slow response for the previous workspace never overwrites the one the user switched to', async ({ page }) => {
  let releaseOldRepoCall: (() => void) | null = null;
  let callCount = 0;

  await withGitMock(page, {
    workspaces: [
      { id: 'ws', rootPath: '/ws', name: 'ws' },
      { id: 'ws2', rootPath: '/ws2', name: 'ws2' },
    ],
    activeWorkspaceId: 'ws',
    trees: {
      '/ws': { path: '/ws', name: 'ws', kind: 'folder', children: [file('/ws/b.md')] },
      '/ws2': { path: '/ws2', name: 'ws2', kind: 'folder', children: [file('/ws2/c.md')] },
    },
    initialFs: { '/ws/b.md': '# B\n', '/ws2/c.md': '# C\n' },
    openFilePath: '/ws/b.md',
    handler: (cmd, args) => {
      const path = args.path as string;
      if (cmd === 'git_get_context') {
        callCount++;
        if (callCount === 1) {
          // The old workspace's status check hangs — released only after
          // the user has already switched to the new workspace below.
          return new Promise((resolve) => {
            releaseOldRepoCall = () => resolve(ctx({ repoRoot: path, currentBranch: 'old-repo-branch', branches: ['old-repo-branch'] }));
          });
        }
        return ctx({ repoRoot: path, currentBranch: 'new-repo-branch', branches: ['new-repo-branch'] });
      }
      if (cmd === 'git_sync') {
        return { state: ctx({ repoRoot: path, currentBranch: 'new-repo-branch', branches: ['new-repo-branch'] }), fetched: true, pulled: false, message: '' };
      }
      return null;
    },
  });
  await page.goto('/');

  // Confirm we're looking at the old (hung) workspace before switching.
  await expect(page.locator('.tree-row[data-tree-path="/ws2/c.md"]')).toBeVisible({ timeout: 10_000 });

  // Switch to a file in the second workspace — this flips gitWorkspaceRoot
  // to /ws2 while the /ws status check from mount is still pending. Opening a
  // file needs a double-click (single click only selects the row); Enter's
  // meaning is platform-dependent (rename on macOS, open elsewhere), so
  // double-click keeps this assertion OS-independent.
  await page.locator('.tree-row[data-tree-path="/ws2/c.md"]').dblclick();
  await expect(page.locator('.tab-bar .tab')).toContainText('c.md', { timeout: 8_000 });

  const select = page.locator('.ws-git-branch');
  await expect(select).toBeVisible({ timeout: 10_000 });
  await expect(select).toHaveValue('new-repo-branch', { timeout: 10_000 });

  // Now release the stale /ws call — it must be dropped, not applied.
  expect(releaseOldRepoCall).not.toBeNull();
  releaseOldRepoCall!();
  await page.waitForTimeout(300);

  await expect(select).toHaveValue('new-repo-branch');
  await expect(select.locator('option')).not.toHaveText(['old-repo-branch']);
});

test('after commit + push, the UI re-verifies with a fresh status check rather than trusting the commit response alone', async ({ page }) => {
  let getContextCalls = 0;

  await withGitMock(page, {
    workspaces: [{ id: 'ws', rootPath: '/ws', name: 'ws' }],
    activeWorkspaceId: 'ws',
    trees: { '/ws': { path: '/ws', name: 'ws', kind: 'folder', children: [file('/ws/b.md')] } },
    initialFs: { '/ws/b.md': '# B\n' },
    openFilePath: '/ws/b.md',
    handler: (cmd) => {
      if (cmd === 'git_get_context') {
        getContextCalls++;
        // Call #1 is the initial mount load (repo starts dirty). Call #2 is
        // the post-commit re-verification this test exists to prove happens —
        // it reports the real, authoritative "clean" state.
        return ctx({ dirty: getContextCalls === 1 });
      }
      if (cmd === 'git_sync') return { state: ctx({ dirty: true }), fetched: true, pulled: false, message: '' };
      if (cmd === 'git_commit_and_push') {
        // Deliberately return a STALE/wrong context bundled with the commit
        // response (as if some other in-flight operation's snapshot leaked
        // in). If the app trusted this value directly, the UI would wrongly
        // keep showing "Local changes" after a successful commit.
        return ctx({ dirty: true });
      }
      return null;
    },
  });
  await page.goto('/');

  const commitBtn = page.getByRole('button', { name: 'Commit + Push' });
  const status = page.locator('.ws-git-state');
  await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
  await expect(status).toContainText('Local changes');

  await commitBtn.click();
  await page.locator('.wid-input').fill('test commit');
  await page.locator('.wid-btn-primary', { hasText: 'Commit + Push' }).click();

  // Ground truth (the fresh re-check) must win over the stale commit response.
  await expect(status).toContainText('No local changes', { timeout: 2_000 });
  expect(getContextCalls).toBeGreaterThanOrEqual(2);
});

test('commit succeeding while push fails (e.g. no remote configured) still refreshes the UI to "No local changes"', async ({ page }) => {
  let getContextCalls = 0;

  await withGitMock(page, {
    workspaces: [{ id: 'ws', rootPath: '/ws', name: 'ws' }],
    activeWorkspaceId: 'ws',
    trees: { '/ws': { path: '/ws', name: 'ws', kind: 'folder', children: [file('/ws/b.md')] } },
    initialFs: { '/ws/b.md': '# B\n' },
    openFilePath: '/ws/b.md',
    handler: (cmd) => {
      if (cmd === 'git_get_context') {
        getContextCalls++;
        // Call #1: initial mount (repo starts dirty). Call #2: the
        // post-commit re-verification — commit succeeded locally (the
        // working tree is clean) even though push below is about to fail.
        return ctx({ dirty: getContextCalls === 1 });
      }
      if (cmd === 'git_sync') return { state: ctx({ dirty: true }), fetched: true, pulled: false, message: '' };
      if (cmd === 'git_commit_and_push') {
        // Mirrors the real backend: `git add -A` + `git commit` succeed, but
        // `push` fails because no remote is configured — the whole backend
        // command rejects even though the commit itself went through.
        throw new Error('git ["push"] failed: no git remote configured to push to');
      }
      return null;
    },
  });
  await page.goto('/');

  const commitBtn = page.getByRole('button', { name: 'Commit + Push' });
  const status = page.locator('.ws-git-state');
  await expect(commitBtn).toBeEnabled({ timeout: 10_000 });
  await expect(status).toContainText('Local changes');

  await commitBtn.click();
  await page.locator('.wid-input').fill('test commit');
  await page.locator('.wid-btn-primary', { hasText: 'Commit + Push' }).click();

  // The commit went through locally, so the status must reflect that — not
  // stay stuck on "Local changes" just because the push step errored.
  await expect(status).toContainText('No local changes', { timeout: 2_000 });
  await expect(page.locator('.ws-git-message')).toContainText('Push failed');
  expect(getContextCalls).toBeGreaterThanOrEqual(2);
});
