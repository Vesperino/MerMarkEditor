import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useSettings, RECENT_WORKSPACES_LIMIT } from './useSettings';

export interface WorkspaceNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children?: WorkspaceNode[];
}

export interface ActiveWorkspace {
  rootPath: string;
  name: string;
}

const tree = ref<WorkspaceNode | null>(null);
const isLoading = ref(false);
const error = ref<string | null>(null);

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

export function useWorkspace() {
  const { settings, setWorkspaceLastRoot, setWorkspaceRecents, setSidebarVisible, setSidebarWidth, toggleSidebarVisible } = useSettings();

  const activeWorkspace = computed<ActiveWorkspace | null>(() => {
    const root = settings.value.workspace.lastRoot;
    if (!root) return null;
    return { rootPath: root, name: basenameOf(root) || root };
  });

  const recentWorkspaces = computed<string[]>(() => settings.value.workspace.recentRoots);
  const sidebarVisible = computed<boolean>(() => settings.value.workspace.sidebarVisible);
  const sidebarWidth = computed<number>(() => settings.value.workspace.sidebarWidth);

  async function loadTree(root: string): Promise<WorkspaceNode> {
    isLoading.value = true;
    error.value = null;
    try {
      const node = await invoke<WorkspaceNode>('read_workspace_tree', { root });
      tree.value = node;
      return node;
    } catch (e) {
      const msg = String(e);
      error.value = msg;
      tree.value = null;
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  async function openWorkspace(rootPath: string): Promise<void> {
    try {
      await loadTree(rootPath);
    } catch (e) {
      throw e;
    }
    setWorkspaceLastRoot(rootPath);
    setWorkspaceRecents(moveToFront(recentWorkspaces.value, rootPath, RECENT_WORKSPACES_LIMIT));
  }

  async function openWorkspaceDialog(): Promise<string | null> {
    const picked = await openDialog({ directory: true, multiple: false });
    if (!picked || typeof picked !== 'string') return null;
    await openWorkspace(picked);
    return picked;
  }

  function closeWorkspace() {
    tree.value = null;
    error.value = null;
    setWorkspaceLastRoot(null);
  }

  async function refreshTree(): Promise<void> {
    const root = settings.value.workspace.lastRoot;
    if (!root) return;
    await loadTree(root);
  }

  /**
   * Restore the previously opened workspace (if any).
   * On failure (folder deleted/moved/perm error) silently clears `lastRoot`
   * so the next launch starts fresh instead of hitting the same error.
   */
  async function restoreLastOnStartup(): Promise<void> {
    const root = settings.value.workspace.lastRoot;
    if (!root) return;
    try {
      await loadTree(root);
    } catch {
      setWorkspaceLastRoot(null);
    }
  }

  function removeRecent(path: string) {
    setWorkspaceRecents(recentWorkspaces.value.filter((p) => p !== path));
  }

  function clearRecents() {
    setWorkspaceRecents([]);
  }

  async function createFile(parent: string, name: string): Promise<string> {
    const created = await invoke<string>('create_md_file', { parent, name });
    await refreshTree();
    return created;
  }

  async function renamePath(from: string, to: string): Promise<void> {
    await invoke('rename_path', { from, to });
    await refreshTree();
  }

  async function deletePath(path: string): Promise<void> {
    await invoke('delete_path', { path });
    await refreshTree();
  }

  async function revealInOs(path: string): Promise<void> {
    await invoke('reveal_in_os', { path });
  }

  return {
    // State
    tree,
    isLoading,
    error,
    activeWorkspace,
    recentWorkspaces,
    sidebarVisible,
    sidebarWidth,

    // Actions
    openWorkspace,
    openWorkspaceDialog,
    closeWorkspace,
    refreshTree,
    restoreLastOnStartup,
    removeRecent,
    clearRecents,
    createFile,
    renamePath,
    deletePath,
    revealInOs,

    // Sidebar visibility / size (re-exported for convenience)
    setSidebarVisible,
    toggleSidebarVisible,
    setSidebarWidth,
  };
}
