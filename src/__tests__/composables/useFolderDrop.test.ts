import { describe, it, expect, beforeEach, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTheme: vi.fn() }),
}));

import { useFolderDrop } from '../../composables/useFolderDrop';
import { useWorkspace, type WorkspaceNode } from '../../composables/useWorkspace';
import { useSettings } from '../../composables/useSettings';
import type { ClassifiedPath } from '../../services/workspaceFs';

const SIDEBAR = { left: 0, top: 32, right: 240, bottom: 800 };
const INSIDE = { x: 120, y: 400 };
const OUTSIDE = { x: 900, y: 400 };

function folderNode(path: string): WorkspaceNode {
  return { name: path, path, kind: 'folder', children: [] };
}

/** Serve `classify_paths` from a fixed table; every other command returns a tree. */
function serve(kinds: Record<string, ClassifiedPath['kind']>) {
  invokeMock.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    if (cmd === 'classify_paths') {
      const paths = (args.paths as string[]) ?? [];
      return Promise.resolve(paths.map((path) => ({ path, kind: kinds[path] ?? 'missing' })));
    }
    if (cmd === 'read_workspace_tree') {
      return Promise.resolve(folderNode(String(args.root)));
    }
    return Promise.resolve(undefined);
  });
}

function resetWorkspaceState() {
  const { settings } = useSettings();
  settings.value.workspace.openWorkspaces = [];
  settings.value.workspace.activeWorkspaceId = null;
  settings.value.workspace.recentRoots = [];
  settings.value.workspace.sidebarVisible = true;
  const ws = useWorkspace();
  ws.expandedFolders.value = new Set();
  ws.collapsedWorkspaceIds.value = new Set();
  ws.highlightedPath.value = null;
  ws.revealSignal.value = null;
}

function makeDrop(overrides: Partial<Parameters<typeof useFolderDrop>[0]> = {}) {
  const ws = useWorkspace();
  const revealWorkspace = vi.fn((id: string) => ws.revealWorkspace(id));
  const drop = useFolderDrop({
    sidebarRect: () => SIDEBAR,
    openWorkspace: ws.openWorkspace,
    revealWorkspace,
    ...overrides,
  });
  return { ws, drop, revealWorkspace };
}

describe('useFolderDrop', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    resetWorkspaceState();
  });

  describe('drag classification', () => {
    it('flags a drag that carries at least one directory', async () => {
      serve({ '/notes': 'folder', '/notes/a.md': 'file' });
      const { drop } = makeDrop();

      await drop.beginDrag(['/notes/a.md', '/notes']);

      expect(drop.dragHasFolder.value).toBe(true);
    });

    it('leaves a file-only drag unflagged', async () => {
      serve({ '/notes/a.md': 'file' });
      const { drop } = makeDrop();

      await drop.beginDrag(['/notes/a.md']);

      expect(drop.dragHasFolder.value).toBe(false);
    });

    it('stays unflagged when classification fails', async () => {
      invokeMock.mockRejectedValue(new Error('no such command'));
      const { drop } = makeDrop();

      await drop.beginDrag(['/notes']);

      expect(drop.dragHasFolder.value).toBe(false);
    });

    it('clears the flag when the drag leaves the window', async () => {
      serve({ '/notes': 'folder' });
      const { drop } = makeDrop();
      await drop.beginDrag(['/notes']);

      drop.endDrag();

      expect(drop.dragHasFolder.value).toBe(false);
    });
  });

  describe('handleDrop', () => {
    it('adds a dropped directory as a workspace', async () => {
      serve({ '/notes': 'folder' });
      const { ws, drop } = makeDrop();

      const added = await drop.handleDrop(['/notes'], INSIDE);

      expect(added).toEqual(['/notes']);
      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/notes']);
    });

    it('adds every dropped directory, in drop order', async () => {
      serve({ '/a': 'folder', '/b': 'folder', '/c': 'folder' });
      const { ws, drop } = makeDrop();

      const added = await drop.handleDrop(['/a', '/b', '/c'], INSIDE);

      expect(added).toEqual(['/a', '/b', '/c']);
      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/a', '/b', '/c']);
    });

    it('does not add a directory twice — reveals the open one instead', async () => {
      serve({ '/notes': 'folder' });
      const { ws, drop, revealWorkspace } = makeDrop();
      const first = await ws.openWorkspace('/notes');
      revealWorkspace.mockClear();

      const added = await drop.handleDrop(['/notes'], INSIDE);

      expect(ws.openWorkspaces.value).toHaveLength(1);
      expect(added).toEqual(['/notes']);
      expect(revealWorkspace).toHaveBeenCalledWith(first.id);
    });

    it('treats a trailing separator as the same directory', async () => {
      serve({ '/notes': 'folder', '/notes/': 'folder' });
      const { ws, drop } = makeDrop();
      await ws.openWorkspace('/notes');

      await drop.handleDrop(['/notes/'], INSIDE);

      expect(ws.openWorkspaces.value).toHaveLength(1);
    });

    it('ignores directories dropped outside the sidebar while it is visible', async () => {
      serve({ '/notes': 'folder' });
      const { ws, drop } = makeDrop();

      const added = await drop.handleDrop(['/notes'], OUTSIDE);

      expect(added).toEqual([]);
      expect(ws.openWorkspaces.value).toHaveLength(0);
    });

    it('accepts a drop anywhere when the sidebar is hidden', async () => {
      serve({ '/notes': 'folder' });
      const { ws, drop } = makeDrop({ sidebarRect: () => null });

      const added = await drop.handleDrop(['/notes'], OUTSIDE);

      expect(added).toEqual(['/notes']);
      expect(ws.openWorkspaces.value).toHaveLength(1);
    });

    it('is a no-op for a file-only drop', async () => {
      serve({ '/notes/a.md': 'file' });
      const { ws, drop } = makeDrop();

      const added = await drop.handleDrop(['/notes/a.md'], INSIDE);

      expect(added).toEqual([]);
      expect(ws.openWorkspaces.value).toHaveLength(0);
    });

    it('adds only the directories of a mixed drop', async () => {
      serve({ '/notes': 'folder', '/elsewhere/a.md': 'file' });
      const { ws, drop } = makeDrop();

      const added = await drop.handleDrop(['/elsewhere/a.md', '/notes'], INSIDE);

      expect(added).toEqual(['/notes']);
      expect(ws.openWorkspaces.value.map((w) => w.rootPath)).toEqual(['/notes']);
    });

    it('skips directories that fail to open and keeps the rest', async () => {
      serve({ '/bad': 'folder', '/good': 'folder' });
      const openWorkspace = vi.fn((root: string) =>
        root === '/bad' ? Promise.reject(new Error('denied')) : Promise.resolve({ id: `id-${root}` }),
      );
      const { drop } = makeDrop({ openWorkspace });

      const added = await drop.handleDrop(['/bad', '/good'], INSIDE);

      expect(added).toEqual(['/good']);
    });

    it('reuses the classification made when the drag entered the window', async () => {
      serve({ '/notes': 'folder' });
      const { drop } = makeDrop();
      await drop.beginDrag(['/notes']);
      invokeMock.mockClear();
      serve({ '/notes': 'folder' });

      await drop.handleDrop(['/notes'], INSIDE);

      expect(invokeMock.mock.calls.filter((c) => c[0] === 'classify_paths')).toHaveLength(0);
    });

    it('classifies on drop when the paths differ from the drag', async () => {
      serve({ '/notes': 'folder', '/other': 'folder' });
      const { drop } = makeDrop();
      await drop.beginDrag(['/notes']);
      invokeMock.mockClear();
      serve({ '/notes': 'folder', '/other': 'folder' });

      await drop.handleDrop(['/other'], INSIDE);

      expect(invokeMock.mock.calls.filter((c) => c[0] === 'classify_paths')).toHaveLength(1);
    });

    it('clears the drag flag once the drop is handled', async () => {
      serve({ '/notes': 'folder' });
      const { drop } = makeDrop();
      await drop.beginDrag(['/notes']);

      await drop.handleDrop(['/notes'], INSIDE);

      expect(drop.dragHasFolder.value).toBe(false);
    });
  });
});
