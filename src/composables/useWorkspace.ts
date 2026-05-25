import { ref, computed } from 'vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  useSettings,
  RECENT_WORKSPACES_LIMIT,
  OPEN_WORKSPACES_LIMIT,
  type OpenWorkspaceEntry,
} from './useSettings';
import { workspaceFs, type WorkspaceNode } from '../services/workspaceFs';
import { basenameOf, isAncestor } from '../utils/path-utils';
import {
  sortNodes,
  resolveSortMode,
  type WorkspaceSortMode,
} from '../utils/workspace-sort';

export type { WorkspaceNode } from '../services/workspaceFs';

/** Tree state per open workspace, keyed by workspace id. */
const treesById = ref<Record<string, WorkspaceNode | null>>({});
const loadingById = ref<Record<string, boolean>>({});
const errorById = ref<Record<string, string | null>>({});

/** Set of folder paths the user has expanded in any workspace's tree. */
const expandedFolders = ref<Set<string>>(new Set());
const autoExpandedSeen = new Set<string>();
/** Workspace ids the user has collapsed in the multi-root sidebar (default expanded). */
const collapsedWorkspaceIds = ref<Set<string>>(new Set());
/** File path that should be highlighted in the tree (usually the active editor tab). */
const highlightedPath = ref<string | null>(null);

/** User-selected node paths (click / Ctrl-click / Shift-click). Multi-select. */
const selectedPaths = ref<Set<string>>(new Set());
/** Anchor for shift-range selection. */
const lastSelectedPath = ref<string | null>(null);

/** True while a workspace tree drag is in flight; lets drop targets accept without MIME-type sniffing. */
const isDraggingNode = ref<boolean>(false);
/** Snapshot of paths being dragged (single, or full selection when source row is part of it). */
const draggedPaths = ref<string[]>([]);

/** File paths open in an editor tab with unsaved changes — drives the tree's dirty dot. */
const dirtyPaths = ref<Set<string>>(new Set());

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
    setWorkspaceSortMode,
    setWorkspaceSortOverride,
    setFolderSortOverride,
    toggleSidebarVisible,
  } = useSettings();

  // ===== Reactive state =====
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
  // ===== Sorting (global default + per-workspace + per-folder overrides) =====
  // All ordering logic lives in utils/workspace-sort (pure, unit-tested);
  // this composable only resolves the effective mode and persists choices.
  const sortMode = computed<WorkspaceSortMode>(() => settings.value.workspace.sortMode);
  const sortByWorkspace = computed(() => settings.value.workspace.sortByWorkspace ?? {});
  const sortByFolder = computed(() => settings.value.workspace.sortByFolder ?? {});

  /** Effective mode for a folder's children — folder override → workspace → global. */
  function effectiveSortMode(folderPath?: string | null, workspaceId?: string | null): WorkspaceSortMode {
    return resolveSortMode({
      folderPath,
      workspaceId,
      folderOverrides: sortByFolder.value,
      workspaceOverrides: sortByWorkspace.value,
      globalMode: sortMode.value,
    });
  }

  /** Order a folder's children using the resolved mode for its scope. */
  function sortChildren(children: WorkspaceNode[], folderPath?: string | null, workspaceId?: string | null): WorkspaceNode[] {
    return sortNodes(children, effectiveSortMode(folderPath, workspaceId));
  }

  function setGlobalSortMode(mode: WorkspaceSortMode) {
    setWorkspaceSortMode(mode);
  }
  function setWorkspaceSort(workspaceId: string, mode: WorkspaceSortMode | null) {
    setWorkspaceSortOverride(workspaceId, mode);
  }
  function setFolderSort(folderPath: string, mode: WorkspaceSortMode | null) {
    setFolderSortOverride(folderPath, mode);
  }

  /** Replace the set of dirty (unsaved) file paths shown with a marker in the tree. */
  function setDirtyPaths(paths: string[]) {
    // Normalize separators so tree paths (which may use \ on Windows) match
    // tab file paths regardless of slash direction.
    dirtyPaths.value = new Set(paths.map((p) => p.replace(/\\/g, '/')));
  }

  function isDirty(path: string): boolean {
    if (dirtyPaths.value.size === 0) return false;
    return dirtyPaths.value.has(path.replace(/\\/g, '/'));
  }

  // Tree view state — scoped to the currently active workspace.
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

  // ===== Tree loading =====

  async function loadTreeFor(entry: OpenWorkspaceEntry): Promise<WorkspaceNode> {
    loadingById.value[entry.id] = true;
    errorById.value[entry.id] = null;
    try {
      const node = await workspaceFs.readTree(entry.rootPath);
      treesById.value[entry.id] = node;
      autoExpandTopLevel(node);
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

  // ===== Public API: workspace lifecycle =====

  /** Open a workspace by path. If already open, switch to it instead. */
  async function openWorkspace(rootPath: string): Promise<OpenWorkspaceEntry> {
    const existing = findOpenByPath(rootPath);
    if (existing) {
      setActiveWorkspaceId(existing.id);
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
      // Drop oldest non-active workspace to make room for the new one.
      const idxToDrop = next.findIndex((w) => w.id !== activeWorkspaceId.value);
      if (idxToDrop >= 0) next.splice(idxToDrop, 1);
    }
    setOpenWorkspaces(next);
    setActiveWorkspaceId(entry.id);

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
    const entry = openWorkspaces.value.find((w) => w.id === id);
    if (entry && !treesById.value[id] && !loadingById.value[id]) {
      loadTreeFor(entry).catch(() => null);
    }
  }

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

  function closeActiveWorkspace() {
    const id = activeWorkspaceId.value;
    if (id) closeWorkspaceById(id);
  }

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

  async function refreshAll(): Promise<void> {
    await Promise.all(
      openWorkspaces.value.map((w) => loadTreeFor(w).catch(() => null)),
    );
  }

  /**
   * Restore previously-open workspaces on app start. Each is loaded
   * independently; failed ones are dropped silently and pushed into recents.
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

  // ===== Public API: file operations =====

  async function createFile(parent: string, name: string): Promise<string> {
    const created = await workspaceFs.createFile(parent, name);
    await refreshAll();
    return created;
  }

  async function createFolder(parent: string, name: string): Promise<string> {
    const created = await workspaceFs.createFolder(parent, name);
    await refreshAll();
    return created;
  }

  async function renamePath(from: string, to: string): Promise<void> {
    await workspaceFs.rename(from, to);
    await refreshAll();
  }

  async function deletePath(path: string): Promise<void> {
    await workspaceFs.remove(path);
    await refreshAll();
  }

  async function revealInOs(path: string): Promise<void> {
    await workspaceFs.reveal(path);
  }

  /** Workspace whose root contains the given path (active set only). */
  function findOwningWorkspace(path: string): OpenWorkspaceEntry | null {
    if (!path) return null;
    for (const w of openWorkspaces.value) {
      if (isAncestor(w.rootPath, path)) return w;
    }
    return null;
  }

  // ===== Public API: tree-view UI state =====

  function isFolderExpanded(path: string): boolean {
    return expandedFolders.value.has(path);
  }

  /**
   * Mark workspace root's immediate folder children as expanded by default,
   * but only the first time they appear — once the user collapses one, the
   * next refresh won't auto-expand it again.
   */
  function autoExpandTopLevel(root: WorkspaceNode) {
    if (!root.children || root.children.length === 0) return;
    const next = new Set(expandedFolders.value);
    let changed = false;
    for (const child of root.children) {
      if (child.kind !== 'folder') continue;
      if (autoExpandedSeen.has(child.path)) continue;
      autoExpandedSeen.add(child.path);
      next.add(child.path);
      changed = true;
    }
    if (changed) expandedFolders.value = next;
  }

  function expandFolder(path: string) {
    if (!expandedFolders.value.has(path)) {
      const next = new Set(expandedFolders.value);
      next.add(path);
      expandedFolders.value = next;
    }
  }

  function collapseFolder(path: string) {
    if (expandedFolders.value.has(path)) {
      const next = new Set(expandedFolders.value);
      next.delete(path);
      expandedFolders.value = next;
    }
  }

  function toggleFolder(path: string) {
    if (expandedFolders.value.has(path)) collapseFolder(path);
    else expandFolder(path);
  }

  /** Expand all ancestor folders of a target path so it becomes visible. */
  function expandAncestorsOf(target: string) {
    const owning = findOwningWorkspace(target);
    if (!owning) return;
    const next = new Set(expandedFolders.value);
    // Walk up from target's parent until we reach the workspace root.
    // Each ancestor folder gets added to the expanded set.
    let cur = target;
    const rootNorm = owning.rootPath.replace(/\\/g, '/');
    for (let i = 0; i < 50; i++) {
      const sepIdx = Math.max(cur.lastIndexOf('/'), cur.lastIndexOf('\\'));
      if (sepIdx < 0) break;
      cur = cur.slice(0, sepIdx);
      const curNorm = cur.replace(/\\/g, '/');
      if (curNorm === rootNorm || curNorm.length < rootNorm.length) break;
      next.add(cur);
    }
    expandedFolders.value = next;
  }

  /**
   * Set the file path to highlight in the tree (typically the editor's
   * currently active file). Auto-expands ancestor folders so the row is
   * visible. Pass null to clear.
   */
  function setHighlightedPath(path: string | null) {
    highlightedPath.value = path;
    if (path) {
      expandAncestorsOf(path);
      // Also expand the section that owns this file so the row is reachable.
      const owning = findOwningWorkspace(path);
      if (owning) expandWorkspaceSection(owning.id);
    }
  }

  // ===== Workspace section collapse/expand (multi-root sidebar) =====

  function isWorkspaceSectionCollapsed(id: string): boolean {
    return collapsedWorkspaceIds.value.has(id);
  }

  function expandWorkspaceSection(id: string) {
    if (collapsedWorkspaceIds.value.has(id)) {
      const next = new Set(collapsedWorkspaceIds.value);
      next.delete(id);
      collapsedWorkspaceIds.value = next;
    }
  }

  function collapseWorkspaceSection(id: string) {
    if (!collapsedWorkspaceIds.value.has(id)) {
      const next = new Set(collapsedWorkspaceIds.value);
      next.add(id);
      collapsedWorkspaceIds.value = next;
    }
  }

  function toggleWorkspaceSection(id: string) {
    if (collapsedWorkspaceIds.value.has(id)) expandWorkspaceSection(id);
    else collapseWorkspaceSection(id);
  }

  function expandAllWorkspaceSections() {
    if (collapsedWorkspaceIds.value.size > 0) {
      collapsedWorkspaceIds.value = new Set();
    }
  }

  function collapseAllWorkspaceSections() {
    const next = new Set<string>();
    for (const w of openWorkspaces.value) next.add(w.id);
    collapsedWorkspaceIds.value = next;
  }

  // ===== Selection (single + multi: Ctrl, Shift) =====

  /**
   * Flat list of currently visible row paths (depth-first, top→bottom across
   * all open workspaces). Used as the index for shift-range selection.
   */
  const visibleNodePaths = computed<string[]>(() => {
    const out: string[] = [];
    const walk = (node: WorkspaceNode, isWorkspaceRoot: boolean, workspaceId: string) => {
      // Workspace root is invisible in the tree — only its children render.
      if (!isWorkspaceRoot) out.push(node.path);
      if (node.kind !== 'folder') return;
      const isExpanded = isWorkspaceRoot || expandedFolders.value.has(node.path);
      if (!isExpanded) return;
      for (const child of sortChildren(node.children ?? [], node.path, workspaceId)) {
        walk(child, false, workspaceId);
      }
    };
    for (const ws of openWorkspaces.value) {
      if (collapsedWorkspaceIds.value.has(ws.id)) continue;
      const tree = treesById.value[ws.id];
      if (tree) walk(tree, true, ws.id);
    }
    return out;
  });

  function isSelected(path: string): boolean {
    return selectedPaths.value.has(path);
  }

  function selectOnly(path: string) {
    selectedPaths.value = new Set([path]);
    lastSelectedPath.value = path;
  }

  function toggleSelect(path: string) {
    const next = new Set(selectedPaths.value);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    selectedPaths.value = next;
    lastSelectedPath.value = path;
  }

  /** Shift-click: select range between anchor (lastSelectedPath) and path. */
  function rangeSelect(path: string) {
    const order = visibleNodePaths.value;
    const anchor = lastSelectedPath.value;
    if (!anchor || order.length === 0) {
      selectOnly(path);
      return;
    }
    const a = order.indexOf(anchor);
    const b = order.indexOf(path);
    if (a < 0 || b < 0) {
      selectOnly(path);
      return;
    }
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    selectedPaths.value = new Set(order.slice(lo, hi + 1));
  }

  function clearSelection() {
    if (selectedPaths.value.size > 0) selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }

  // ===== Drag (workspace tree → editor or workspace tree → tree folder) =====

  /** Begin a drag — if path is part of current selection, drag whole set; else drag just that path. */
  function beginNodeDrag(path: string): string[] {
    const set = selectedPaths.value;
    const paths = set.size > 0 && set.has(path) ? Array.from(set) : [path];
    draggedPaths.value = paths;
    isDraggingNode.value = true;
    return paths;
  }

  function endNodeDrag() {
    isDraggingNode.value = false;
    draggedPaths.value = [];
  }

  return {
    // State
    openWorkspaces,
    activeWorkspaceId,
    activeWorkspace,
    recentWorkspaces,
    sidebarVisible,
    sidebarWidth,
    sortMode,
    sortByWorkspace,
    sortByFolder,
    sortChildren,
    effectiveSortMode,
    setGlobalSortMode,
    setWorkspaceSort,
    setFolderSort,
    tree,
    isLoading,
    error,
    treesById,
    expandedFolders,
    collapsedWorkspaceIds,
    highlightedPath,
    selectedPaths,
    lastSelectedPath,
    isDraggingNode,
    draggedPaths,
    dirtyPaths,
    setDirtyPaths,
    isDirty,

    // Workspace lifecycle
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

    // File operations
    createFile,
    createFolder,
    renamePath,
    deletePath,
    revealInOs,
    findOwningWorkspace,

    // Tree view
    isFolderExpanded,
    expandFolder,
    collapseFolder,
    toggleFolder,
    expandAncestorsOf,
    setHighlightedPath,

    // Workspace section collapse
    isWorkspaceSectionCollapsed,
    expandWorkspaceSection,
    collapseWorkspaceSection,
    toggleWorkspaceSection,
    expandAllWorkspaceSections,
    collapseAllWorkspaceSections,

    // Sidebar
    setSidebarVisible,
    toggleSidebarVisible,
    setSidebarWidth,

    // Selection
    visibleNodePaths,
    isSelected,
    selectOnly,
    toggleSelect,
    rangeSelect,
    clearSelection,

    // Drag
    beginNodeDrag,
    endNodeDrag,
  };
}
