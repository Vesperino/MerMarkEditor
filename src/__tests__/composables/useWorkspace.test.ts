import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri APIs BEFORE importing the composable.
const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const openDialogMock = vi.fn();
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openDialogMock(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTheme: vi.fn() }),
}));

import { useWorkspace, type WorkspaceNode } from '../../composables/useWorkspace';
import { useSettings, RECENT_WORKSPACES_LIMIT } from '../../composables/useSettings';

function makeFolderNode(path: string): WorkspaceNode {
  return { name: path, path, kind: 'folder', children: [] };
}

function resetWorkspaceState() {
  const { settings } = useSettings();
  settings.value.workspace.lastRoot = null;
  settings.value.workspace.recentRoots = [];
  settings.value.workspace.sidebarVisible = true;
  settings.value.workspace.sidebarWidth = 240;
}

describe('useWorkspace', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openDialogMock.mockReset();
    resetWorkspaceState();
  });

  describe('openWorkspace', () => {
    it('loads tree, sets lastRoot, and adds to recents', async () => {
      const ws = useWorkspace();
      const node = makeFolderNode('/path/to/workspace');
      invokeMock.mockResolvedValueOnce(node);

      await ws.openWorkspace('/path/to/workspace');

      expect(invokeMock).toHaveBeenCalledWith('read_workspace_tree', { root: '/path/to/workspace' });
      expect(ws.tree.value).toEqual(node);
      expect(ws.activeWorkspace.value?.rootPath).toBe('/path/to/workspace');
      expect(ws.recentWorkspaces.value).toEqual(['/path/to/workspace']);
    });

    it('moves an already-recent path to the front (LRU)', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('a'));
      await ws.openWorkspace('/a');
      await ws.openWorkspace('/b');
      await ws.openWorkspace('/a'); // re-open /a, should move to front

      expect(ws.recentWorkspaces.value).toEqual(['/a', '/b']);
    });

    it('caps recents at RECENT_WORKSPACES_LIMIT', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      for (let i = 0; i < RECENT_WORKSPACES_LIMIT + 3; i++) {
        await ws.openWorkspace(`/p${i}`);
      }
      expect(ws.recentWorkspaces.value.length).toBe(RECENT_WORKSPACES_LIMIT);
      // Most recent first
      expect(ws.recentWorkspaces.value[0]).toBe(`/p${RECENT_WORKSPACES_LIMIT + 2}`);
    });

    it('propagates load errors and does not update state', async () => {
      const ws = useWorkspace();
      // Pre-populate something different so we can assert no overwrite.
      invokeMock.mockResolvedValueOnce(makeFolderNode('pre'));
      await ws.openWorkspace('/pre');

      invokeMock.mockRejectedValueOnce(new Error('boom'));
      await expect(ws.openWorkspace('/bad')).rejects.toThrow('boom');

      expect(ws.activeWorkspace.value?.rootPath).toBe('/pre');
      expect(ws.recentWorkspaces.value).toEqual(['/pre']);
    });
  });

  describe('closeWorkspace', () => {
    it('clears tree and lastRoot but keeps recents', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('x'));
      await ws.openWorkspace('/x');
      ws.closeWorkspace();

      expect(ws.tree.value).toBeNull();
      expect(ws.activeWorkspace.value).toBeNull();
      expect(ws.recentWorkspaces.value).toEqual(['/x']);
    });
  });

  describe('restoreLastOnStartup', () => {
    it('does nothing when no lastRoot', async () => {
      const ws = useWorkspace();
      await ws.restoreLastOnStartup();
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('loads tree when lastRoot is set', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.lastRoot = '/root';
      invokeMock.mockResolvedValueOnce(makeFolderNode('/root'));

      await ws.restoreLastOnStartup();

      expect(invokeMock).toHaveBeenCalledWith('read_workspace_tree', { root: '/root' });
      expect(ws.tree.value?.path).toBe('/root');
    });

    it('clears lastRoot silently when load fails', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.lastRoot = '/missing';
      invokeMock.mockRejectedValueOnce(new Error('not found'));

      await ws.restoreLastOnStartup();

      expect(settings.value.workspace.lastRoot).toBeNull();
      expect(ws.tree.value).toBeNull();
    });
  });

  describe('refreshTree', () => {
    it('re-invokes read_workspace_tree with current lastRoot', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));
      await ws.openWorkspace('/r');

      invokeMock.mockClear();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));
      await ws.refreshTree();

      expect(invokeMock).toHaveBeenCalledWith('read_workspace_tree', { root: '/r' });
    });

    it('is a no-op when no workspace is open', async () => {
      const ws = useWorkspace();
      await ws.refreshTree();
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });

  describe('removeRecent', () => {
    it('drops a single entry', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.openWorkspace('/a');
      await ws.openWorkspace('/b');
      ws.removeRecent('/a');

      expect(ws.recentWorkspaces.value).toEqual(['/b']);
    });
  });

  describe('file operations', () => {
    it('createFile invokes command and refreshes tree', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));
      await ws.openWorkspace('/r');

      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce('/r/new.md'); // create_md_file
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r')); // refresh

      const created = await ws.createFile('/r', 'new');
      expect(created).toBe('/r/new.md');

      const calls = invokeMock.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['create_md_file', 'read_workspace_tree']);
    });

    it('renamePath invokes command and refreshes tree', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));
      await ws.openWorkspace('/r');

      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce(undefined);
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));

      await ws.renamePath('/r/a.md', '/r/b.md');
      const calls = invokeMock.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['rename_path', 'read_workspace_tree']);
    });

    it('deletePath invokes command and refreshes tree', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));
      await ws.openWorkspace('/r');

      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce(undefined);
      invokeMock.mockResolvedValueOnce(makeFolderNode('/r'));

      await ws.deletePath('/r/a.md');
      const calls = invokeMock.mock.calls.map((c) => c[0]);
      expect(calls).toEqual(['delete_path', 'read_workspace_tree']);
    });

    it('revealInOs invokes command without refresh', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(undefined);
      await ws.revealInOs('/r/a.md');
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith('reveal_in_os', { path: '/r/a.md' });
    });
  });

  describe('openWorkspaceDialog', () => {
    it('opens picker, then loads picked path', async () => {
      const ws = useWorkspace();
      openDialogMock.mockResolvedValueOnce('/picked');
      invokeMock.mockResolvedValueOnce(makeFolderNode('/picked'));

      const picked = await ws.openWorkspaceDialog();
      expect(picked).toBe('/picked');
      expect(ws.activeWorkspace.value?.rootPath).toBe('/picked');
    });

    it('returns null when user cancels', async () => {
      const ws = useWorkspace();
      openDialogMock.mockResolvedValueOnce(null);
      const picked = await ws.openWorkspaceDialog();
      expect(picked).toBeNull();
      expect(invokeMock).not.toHaveBeenCalled();
    });
  });

  describe('activeWorkspace.name', () => {
    it('uses the basename of the path', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/Users/me/notes'));
      await ws.openWorkspace('/Users/me/notes');
      expect(ws.activeWorkspace.value?.name).toBe('notes');
    });

    it('handles trailing slashes', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/x/y/'));
      await ws.openWorkspace('/x/y/');
      expect(ws.activeWorkspace.value?.name).toBe('y');
    });
  });
});
