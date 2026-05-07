import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  useSettings,
  RECENT_WORKSPACES_LIMIT,
  OPEN_WORKSPACES_LIMIT,
  type OpenWorkspaceEntry,
} from './useSettings';

export interface WorkspaceNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: WorkspaceNode[];
}

/** Tree state per open workspace, keyed by workspace id. */
const treesById = ref<Record<string, WorkspaceNode | null>>({});
const loadingById = ref<Record<string, boolean>>({});
const errorById = ref<Record<string, string | null>>({});

function basenameOf(p: string): string {
  if (!p) return '';
  const trimmed = p.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

function moveToFront(list: string[], item: string, limit: number): string[] {
  const filtered = list.filter((p) => p !== item);
  filtered.unshift(item);
  return filtered.slice(0, limit);
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useWorkspace() {
  const {
    settings,
    setOpenWorkspaces,
    setActiveWorkspaceId,
    setWorkspaceRecents,
    setSidebarVisible,
    setSidebarWidth,
    toggleSidebarVisible,
  } = useSettings();

  // ===== State =====
  const openWorkspaces = computed<OpenWorkspaceEntry[]>(
    () => settings.value.workspace.openWorkspaces,
  );
  const activeWorkspaceId = computed<string | null>(
    () => settings.value.workspace.activeWorkspaceId,
  );
  const activeWorkspace = computed<OpenWorkspaceEntry | null>(() => {
    const id = activeWorkspaceId.value;
    if (!id) return null;
    return openWorkspaces.value.find((w) => w.id === id) ?? null;
  });
  const recentWorkspaces = computed<string[]>(() => settings.value.workspace.recentRoots);
  const sidebarVisible = computed<boolean>(() => settings.value.workspace.sidebarVisible);
  const sidebarWidth = computed<number>(() => settings.value.workspace.sidebarWidth);

  // ===== Tree access scoped to active workspace =====
  const tree = computed<WorkspaceNode | null>(() => {
    const id = activeWorkspaceId.value;
    return id ? treesById.value[id] ?? null : null;
  });
  const isLoading = computed<boolean>(() => {
    const id = activeWorkspaceId.value;
    return id ? !!loadingById.value[id] : false;
  });
  const error = computed<string | null>(() => {
    const id = activeWorkspaceId.value;
    return id ? errorById.value[id] ?? null : null;
  });

  // ===== Internal helpers =====
  async function loadTreeFor(entry: OpenWorkspaceEntry): Promise<WorkspaceNode> {
    loadingById.value[entry.id] = true;
    errorById.value[entry.id] = null;
    try {
      const node = await invoke<WorkspaceNode>('read_workspace_tree', { root: entry.rootPath });
      treesById.value[entry.id] = node;
      return node;
    } catch (e) {
      const msg = String(e);
      errorById.value[entry.id] = msg;
      treesById.value[entry.id] = null;
      throw new Error(msg);
    } finally {
      loadingById.value[entry.id] = false;
    }
  }

  function findOpenByPath(path: string): OpenWorkspaceEntry | null {
    return openWorkspaces.value.find((w) => w.rootPath === path) ?? null;
  }

  // ===== Public API =====

  /** Open a workspace by path. If already open, switch to it instead. Caps to OPEN_WORKSPACES_LIMIT. */
  async function openWorkspace(rootPath: string): Promise<OpenWorkspaceEntry> {
    const existing = findOpenByPath(rootPath);
    if (existing) {
      setActiveWorkspaceId(existing.id);
      // Ensure tree is current — refresh if missing.
      if (!treesById.value[existing.id]) {
        await loadTreeFor(existing).catch(() => null);
      }
      return existing;
    }

    const entry: OpenWorkspaceEntry = {
      id: newId(),
      rootPath,
      name: basenameOf(rootPath) || rootPath,
    };

    // Validate by loading tree first; only mutate state on success.
    treesById.value[entry.id] = null;
    try {
      await loadTreeFor(entry);
    } catch (e) {
      delete treesById.value[entry.id];
      delete loadingById.value[entry.id];
      delete errorById.value[entry.id];
      throw e;
    }

    const next = [...openWorkspaces.value, entry];
    if (next.length > OPEN_WORKSPACES_LIMIT) {
      // Drop oldest non-active workspace.
      const idxToDrop = next.findIndex((w) => w.id !== activeWorkspaceId.value);
      if (idxToDrop >= 0) next.splice(idxToDrop, 1);
    }
    setOpenWorkspaces(next);
    setActiveWorkspaceId(entry.id);

    // Remove from recents (it's now open) — recents holds *closed* workspaces.
    setWorkspaceRecents(recentWorkspaces.value.filter((p) => p !== rootPath));
    return entry;
  }

  async function openWorkspaceDialog(): Promise<string | null> {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || typeof picked !== 'string') return null;
    await openWorkspace(picked);
    return picked;
  }

  function setActive(id: string) {
    setActiveWorkspaceId(id);
    // Lazy-load tree if missing
    const entry = openWorkspaces.value.find((w) => w.id === id);
    if (entry && !treesById.value[id] && !loadingById.value[id]) {
      loadTreeFor(entry).catch(() => null);
    }
  }

  /** Close one workspace by id. Moves it to recents (LRU). */
  function closeWorkspaceById(id: string) {
    const entry = openWorkspaces.value.find((w) => w.id === id);
    const next = openWorkspaces.value.filter((w) => w.id !== id);
    setOpenWorkspaces(next);
    delete treesById.value[id];
    delete loadingById.value[id];
    delete errorById.value[id];
    if (entry?.rootPath) {
      setWorkspaceRecents(moveToFront(recentWorkspaces.value, entry.rootPath, RECENT_WORKSPACES_LIMIT));
    }
  }

  /** Close the currently active workspace. */
  function closeActiveWorkspace() {
    const id = activeWorkspaceId.value;
    if (id) closeWorkspaceById(id);
  }

  /** Close ALL open workspaces (moves each to recents). */
  function closeAllWorkspaces() {
    for (const w of [...openWorkspaces.value]) {
      closeWorkspaceById(w.id);
    }
  }

  async function refreshTree(): Promise<void> {
    const entry = activeWorkspace.value;
    if (!entry) return;
    await loadTreeFor(entry);
  }

  /** Refresh ALL open workspace trees in parallel. */
  async function refreshAll(): Promise<void> {
    await Promise.all(
      openWorkspaces.value.map((w) => loadTreeFor(w).catch(() => null)),
    );
  }

  /**
   * Restore previously-open workspaces on app start.
   * Each is loaded independently; failed ones are dropped silently and pushed
   * into recents so the user can re-open them later if the path is valid again.
   */
  async function restoreLastOnStartup(): Promise<void> {
    const entries = [...openWorkspaces.value];
    if (entries.length === 0) return;

    const validEntries: OpenWorkspaceEntry[] = [];
    const droppedRoots: string[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        try {
          await loadTreeFor(entry);
          validEntries.push(entry);
        } catch {
          droppedRoots.push(entry.rootPath);
        }
      }),
    );

    if (validEntries.length !== entries.length) {
      setOpenWorkspaces(validEntries);
      // Move dropped to recents (oldest first so most recent is at the front)
      let recents = recentWorkspaces.value;
      for (const root of droppedRoots) {
        recents = moveToFront(recents, root, RECENT_WORKSPACES_LIMIT);
      }
      setWorkspaceRecents(recents);
    }
  }

  function removeRecent(path: string) {
    setWorkspaceRecents(recentWorkspaces.value.filter((p) => p !== path));
  }

  function clearRecents() {
    setWorkspaceRecents([]);
  }

  function reorderOpenWorkspaces(from: number, to: number) {
    if (from === to) return;
    const list = [...openWorkspaces.value];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setOpenWorkspaces(list);
  }

  // ===== File operations (scoped to whichever workspace contains the path) =====

  async function createFile(parent: string, name: string): Promise<string> {
    const created = await invoke<string>('create_md_file', { parent, name });
    await refreshAll();
    return created;
  }

  async function renamePath(from: string, to: string): Promise<void> {
    await invoke('rename_path', { from, to });
    await refreshAll();
  }

  async function deletePath(path: string): Promise<void> {
    await invoke('delete_path', { path });
    await refreshAll();
  }

  async function revealInOs(path: string): Promise<void> {
    await invoke('reveal_in_os', { path });
  }

  /**
   * Returns the workspace whose root is an ancestor of (or equal to) `path`.
   * Used for AI workdir selection and for scoping file operations to a tab.
   */
  function findOwningWorkspace(path: string): OpenWorkspaceEntry | null {
    if (!path) return null;
    const norm = path.replace(/\\/g, '/');
    for (const w of openWorkspaces.value) {
      const root = w.rootPath.replace(/\\/g, '/');
      if (norm === root || norm.startsWith(root + '/')) return w;
    }
    return null;
  }

  return {
    // State
    openWorkspaces,
    activeWorkspaceId,
    activeWorkspace,
    recentWorkspaces,
    sidebarVisible,
    sidebarWidth,
    tree,
    isLoading,
    error,
    treesById,

    // Actions
    openWorkspace,
    openWorkspaceDialog,
    setActive,
    closeWorkspaceById,
    closeActiveWorkspace,
    closeAllWorkspaces,
    refreshTree,
    refreshAll,
    restoreLastOnStartup,
    removeRecent,
    clearRecents,
    reorderOpenWorkspaces,
    createFile,
    renamePath,
    deletePath,
    revealInOs,
    findOwningWorkspace,

    // Sidebar visibility / size (re-exported for convenience)
    setSidebarVisible,
    toggleSidebarVisible,
    setSidebarWidth,
  };
}
