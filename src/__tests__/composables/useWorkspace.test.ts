import { describe, it, expect, beforeEach, vi } from 'vitest';

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
import { useSettings, RECENT_WORKSPACES_LIMIT, OPEN_WORKSPACES_LIMIT } from '../../composables/useSettings';

function makeFolderNode(path: string): WorkspaceNode {
  return { name: path, path, kind: 'folder', children: [] };
}

function resetWorkspaceState() {
  const { settings } = useSettings();
  settings.value.workspace.openWorkspaces = [];
  settings.value.workspace.activeWorkspaceId = null;
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
    it('loads tree and adds entry to openWorkspaces; sets active', async () => {
      const ws = useWorkspace();
      const node = makeFolderNode('/path/to/workspace');
      invokeMock.mockResolvedValueOnce(node);

      const entry = await ws.openWorkspace('/path/to/workspace');

      expect(invokeMock).toHaveBeenCalledWith('read_workspace_tree', { root: '/path/to/workspace' });
      expect(ws.openWorkspaces.value).toHaveLength(1);
      expect(ws.openWorkspaces.value[0].rootPath).toBe('/path/to/workspace');
      expect(ws.activeWorkspace.value?.id).toBe(entry.id);
      expect(ws.tree.value).toEqual(node);
    });

    it('switches to existing entry instead of duplicating', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('/x'));

      await ws.openWorkspace('/x');
      const firstId = ws.activeWorkspace.value!.id;
      // Open something else, then re-open /x
      invokeMock.mockResolvedValueOnce(makeFolderNode('/y'));
      await ws.openWorkspace('/y');
      invokeMock.mockResolvedValueOnce(makeFolderNode('/x'));
      const second = await ws.openWorkspace('/x');

      expect(second.id).toBe(firstId);
      expect(ws.openWorkspaces.value).toHaveLength(2);
      expect(ws.activeWorkspace.value?.rootPath).toBe('/x');
    });

    it('caps open workspaces at OPEN_WORKSPACES_LIMIT (drops oldest non-active)', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));

      for (let i = 0; i < OPEN_WORKSPACES_LIMIT + 2; i++) {
        await ws.openWorkspace(`/p${i}`);
      }
      expect(ws.openWorkspaces.value.length).toBeLessThanOrEqual(OPEN_WORKSPACES_LIMIT);
      // The most recently opened is active
      expect(ws.activeWorkspace.value?.rootPath).toBe(`/p${OPEN_WORKSPACES_LIMIT + 1}`);
    });

    it('does not pollute state when load fails', async () => {
      const ws = useWorkspace();
      invokeMock.mockRejectedValueOnce(new Error('boom'));
      await expect(ws.openWorkspace('/bad')).rejects.toThrow('boom');
      expect(ws.openWorkspaces.value).toHaveLength(0);
      expect(ws.activeWorkspace.value).toBeNull();
    });

    it('removes path from recents when opened', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.recentRoots = ['/x', '/y'];
      invokeMock.mockResolvedValueOnce(makeFolderNode('/x'));
      await ws.openWorkspace('/x');
      expect(ws.recentWorkspaces.value).toEqual(['/y']);
    });
  });

  describe('closeWorkspaceById', () => {
    it('drops the workspace and pushes its path to recents', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/a'));
      const a = await ws.openWorkspace('/a');
      invokeMock.mockResolvedValueOnce(makeFolderNode('/b'));
      await ws.openWorkspace('/b');

      ws.closeWorkspaceById(a.id);

      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/b']);
      expect(ws.recentWorkspaces.value).toEqual(['/a']);
    });

    it('switches active when active is closed', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/a'));
      await ws.openWorkspace('/a');
      invokeMock.mockResolvedValueOnce(makeFolderNode('/b'));
      const b = await ws.openWorkspace('/b'); // active = b
      ws.closeWorkspaceById(b.id);
      expect(ws.activeWorkspace.value?.rootPath).toBe('/a');
    });
  });

  describe('setActive', () => {
    it('switches active id and lazy-loads tree if missing', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('/a'));
      const a = await ws.openWorkspace('/a');
      invokeMock.mockResolvedValueOnce(makeFolderNode('/b'));
      const b = await ws.openWorkspace('/b'); // tree(b) loaded

      // Drop tree(a) to simulate missing tree
      ws.treesById.value[a.id] = null;
      invokeMock.mockResolvedValueOnce(makeFolderNode('/a'));
      ws.setActive(a.id);
      // Wait for the lazy-load microtask
      await Promise.resolve();
      await Promise.resolve();
      expect(ws.activeWorkspace.value?.id).toBe(a.id);
      expect(invokeMock).toHaveBeenCalledWith('read_workspace_tree', { root: '/a' });
      // b still around
      expect(ws.openWorkspaces.value.map((w) => w.id)).toContain(b.id);
    });
  });

  describe('restoreLastOnStartup', () => {
    it('does nothing when no openWorkspaces', async () => {
      const ws = useWorkspace();
      await ws.restoreLastOnStartup();
      expect(invokeMock).not.toHaveBeenCalled();
    });

    it('loads all open workspaces in parallel', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.openWorkspaces = [
        { id: 'a', rootPath: '/a', name: 'a' },
        { id: 'b', rootPath: '/b', name: 'b' },
      ];
      settings.value.workspace.activeWorkspaceId = 'a';
      invokeMock.mockResolvedValue(makeFolderNode('any'));

      await ws.restoreLastOnStartup();

      expect(invokeMock).toHaveBeenCalledTimes(2);
      expect(ws.openWorkspaces.value).toHaveLength(2);
    });

    it('drops failed entries and moves them to recents', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.openWorkspaces = [
        { id: 'a', rootPath: '/missing', name: 'missing' },
        { id: 'b', rootPath: '/ok', name: 'ok' },
      ];
      settings.value.workspace.activeWorkspaceId = 'a';
      invokeMock.mockImplementation((_cmd, args) => {
        const root = (args as { root?: string }).root;
        if (root === '/missing') return Promise.reject(new Error('not found'));
        return Promise.resolve(makeFolderNode(root || ''));
      });

      await ws.restoreLastOnStartup();

      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/ok']);
      expect(ws.recentWorkspaces.value).toContain('/missing');
    });
  });

  describe('refreshAll', () => {
    it('re-invokes read_workspace_tree for every open workspace', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.openWorkspace('/a');
      await ws.openWorkspace('/b');

      invokeMock.mockClear();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.refreshAll();

      const treeCalls = invokeMock.mock.calls.filter((c) => c[0] === 'read_workspace_tree');
      expect(treeCalls).toHaveLength(2);
    });
  });

  describe('removeRecent', () => {
    it('drops a single entry', async () => {
      const ws = useWorkspace();
      const { settings } = useSettings();
      settings.value.workspace.recentRoots = ['/a', '/b'];
      ws.removeRecent('/a');
      expect(ws.recentWorkspaces.value).toEqual(['/b']);
    });
  });

  describe('reorderOpenWorkspaces', () => {
    it('moves an entry from one index to another', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.openWorkspace('/a');
      await ws.openWorkspace('/b');
      await ws.openWorkspace('/c');
      ws.reorderOpenWorkspaces(0, 2);
      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/b', '/c', '/a']);
    });
  });

  describe('file operations', () => {
    it('createFile invokes command and refreshes all open trees', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.openWorkspace('/r1');
      await ws.openWorkspace('/r2');

      invokeMock.mockReset();
      invokeMock.mockResolvedValueOnce('/r1/new.md');
      invokeMock.mockResolvedValue(makeFolderNode('any'));

      const created = await ws.createFile('/r1', 'new');
      expect(created).toBe('/r1/new.md');

      const cmds = invokeMock.mock.calls.map((c) => c[0]);
      expect(cmds[0]).toBe('create_md_file');
      // both trees refresh
      expect(cmds.filter((c) => c === 'read_workspace_tree')).toHaveLength(2);
    });

    it('revealInOs invokes command without refresh', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(undefined);
      await ws.revealInOs('/r/a.md');
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith('reveal_in_os', { path: '/r/a.md' });
    });
  });

  describe('findOwningWorkspace', () => {
    it('returns the workspace whose root is an ancestor of the path', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      await ws.openWorkspace('/notes');
      await ws.openWorkspace('/code');

      const owner = ws.findOwningWorkspace('/notes/sub/file.md');
      expect(owner?.rootPath).toBe('/notes');
      expect(ws.findOwningWorkspace('/elsewhere/x.md')).toBeNull();
    });

    it('handles backslash separators', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValueOnce(makeFolderNode('C:\\notes'));
      await ws.openWorkspace('C:\\notes');
      const owner = ws.findOwningWorkspace('C:\\notes\\sub\\x.md');
      expect(owner?.rootPath).toBe('C:\\notes');
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

  describe('recents LRU', () => {
    it('caps recents at RECENT_WORKSPACES_LIMIT after sequential open+close cycles', async () => {
      const ws = useWorkspace();
      invokeMock.mockResolvedValue(makeFolderNode('any'));
      for (let i = 0; i < RECENT_WORKSPACES_LIMIT + 3; i++) {
        const e = await ws.openWorkspace(`/p${i}`);
        ws.closeWorkspaceById(e.id);
      }
      expect(ws.recentWorkspaces.value.length).toBe(RECENT_WORKSPACES_LIMIT);
    });
  });
});
