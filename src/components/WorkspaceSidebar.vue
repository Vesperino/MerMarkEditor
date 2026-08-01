<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace, type WorkspaceNode } from '../composables/useWorkspace';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '../composables/useSettings';
import WorkspaceSection from './WorkspaceSection.vue';
import WorkspaceContextMenu, { type WorkspaceContextAction } from './WorkspaceContextMenu.vue';
import WorkspaceSortMenu from './WorkspaceSortMenu.vue';
import WorkspaceInputDialog from './WorkspaceInputDialog.vue';
import WorkspaceConfirmDialog from './WorkspaceConfirmDialog.vue';
import type { WorkspaceSortMode } from '../utils/workspace-sort';
import { basenameOf } from '../utils/path-utils';
import {
  autoScrollStep,
  exceedsThreshold,
  planMoves,
  resolveDragSource,
  resolveDropHit,
  type DragSource,
  type Point,
} from '../utils/pointer-drag';

/**
 * Multi-root workspace sidebar (VS Code / Obsidian inspired).
 *
 * Each open workspace is rendered as its own collapsible section. The user
 * can have many workspaces open at once and quickly scan them all without
 * having to switch tabs. The "active" workspace — the one whose root
 * contains the currently open file — gets a subtle accent so the user
 * always knows where they are working.
 *
 * Top-level concerns split between three siblings:
 *   - WorkspaceSidebar (this file): outer chrome, header, sections list
 *   - WorkspaceSection: one collapsible workspace + its tree
 *   - FileTreeNode: recursive node renderer (single file/folder row)
 */

const { t } = useI18n();
const ws = useWorkspace();

defineProps<{
  /** True while an OS drag carrying a directory hovers the window (#124). */
  folderDropActive?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-file', path: string): void;
  (e: 'open-quick-switcher'): void;
  (e: 'view-changes', path: string): void;
  (e: 'drop-in-pane', payload: { paneId: string; paths: string[] }): void;
}>();

const showHeaderMenu = ref(false);

// ===== Sort menu state =====
// Reused for the global default (scope='global') and per-folder overrides
// (scope='folder' carries the folder path). Per-workspace sort is handled by
// WorkspaceSection directly.
type SortMenuState =
  | { scope: 'global'; x: number; y: number }
  | { scope: 'folder'; x: number; y: number; folderPath: string };
const sortMenu = ref<SortMenuState | null>(null);

function openGlobalSortMenu(e: MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  sortMenu.value = { scope: 'global', x: r.left, y: r.bottom + 4 };
}

function onFolderSortRequest(payload: { path: string; x: number; y: number }) {
  sortMenu.value = { scope: 'folder', x: payload.x, y: payload.y, folderPath: payload.path };
}

const sortMenuCurrent = computed<WorkspaceSortMode>(() => {
  const s = sortMenu.value;
  if (!s) return ws.sortMode.value;
  if (s.scope === 'folder') return ws.effectiveSortMode(s.folderPath, ws.findOwningWorkspace(s.folderPath)?.id ?? null);
  return ws.sortMode.value;
});
const sortMenuHasOverride = computed<boolean>(() => {
  const s = sortMenu.value;
  if (s?.scope === 'folder') return !!ws.sortByFolder.value[s.folderPath];
  return false;
});

function onSortMenuSelect(mode: WorkspaceSortMode | null) {
  const s = sortMenu.value;
  if (!s) return;
  if (s.scope === 'global') {
    if (mode) ws.setGlobalSortMode(mode);
  } else {
    ws.setFolderSort(s.folderPath, mode);
  }
}

// ===== Context menu state (right-click on tree node) =====
const ctxX = ref(0);
const ctxY = ref(0);
const ctxNode = ref<WorkspaceNode | null>(null);
const ctxIsRoot = ref(false);

function openContext(payload: { x: number; y: number; node: WorkspaceNode }) {
  ctxX.value = payload.x;
  ctxY.value = payload.y;
  ctxNode.value = payload.node;
  // A right-click on a workspace section header carries a synthetic node whose
  // path matches one of the open workspace roots — flag it so the menu hides
  // rename/delete (those would target the workspace folder itself).
  ctxIsRoot.value = ws.openWorkspaces.value.some((w) => w.rootPath === payload.node.path);
}
function closeContext() {
  ctxNode.value = null;
}

// Dialog state for input prompts (new file / rename) and the delete
// confirmation. We collect what to do in `pendingAction`, render the
// matching dialog, and run the actual fs op when the user confirms.
type PendingAction =
  | { kind: 'new-file'; parent: string }
  | { kind: 'new-folder'; parent: string }
  | { kind: 'rename'; from: string; originalName: string }
  | { kind: 'delete'; path: string; name: string }
  | { kind: 'delete-many'; paths: string[]; name: string };

const pendingAction = ref<PendingAction | null>(null);

async function onContextAction(action: WorkspaceContextAction) {
  const node = ctxNode.value;
  if (!node) return;

  if (action === 'reveal') {
    try { await ws.revealInOs(node.path); } catch (e) { console.error('reveal:', e); }
    return;
  }
  if (action === 'new-file') {
    if (node.kind !== 'folder') return;
    pendingAction.value = { kind: 'new-file', parent: node.path };
    return;
  }
  if (action === 'new-folder') {
    if (node.kind !== 'folder') return;
    pendingAction.value = { kind: 'new-folder', parent: node.path };
    return;
  }
  // Sibling actions create in the node's PARENT directory — "alongside" the
  // clicked file/folder. Strip the last path segment to get the parent.
  if (action === 'new-file-sibling' || action === 'new-folder-sibling') {
    const sepIdx = Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'));
    if (sepIdx < 0) return;
    const parent = node.path.slice(0, sepIdx);
    pendingAction.value = {
      kind: action === 'new-file-sibling' ? 'new-file' : 'new-folder',
      parent,
    };
    return;
  }
  if (action === 'sort-folder') {
    if (node.kind !== 'folder') return;
    // Reopen as the sort menu at the same spot the context menu was.
    sortMenu.value = { scope: 'folder', x: ctxX.value, y: ctxY.value, folderPath: node.path };
    return;
  }
  if (action === 'copy-path') {
    try { await navigator.clipboard.writeText(node.path); }
    catch (e) { console.error('copy path:', e); }
    return;
  }
  if (action === 'rename') {
    pendingAction.value = { kind: 'rename', from: node.path, originalName: node.name };
    return;
  }
  if (action === 'delete') {
    // When the right-clicked row is part of a multi-selection, delete the
    // whole selection (matches the Delete-key behaviour and Explorer/VS).
    const selected = ws.selectedPaths.value;
    if (selected.size > 1 && selected.has(node.path)) {
      const paths = Array.from(selected);
      pendingAction.value = {
        kind: 'delete-many',
        paths,
        name: `${paths.length} ${t.value.workspaceItemsLabel}`,
      };
    } else {
      pendingAction.value = { kind: 'delete', path: node.path, name: node.name };
    }
  }
}

function dismissDialog() {
  pendingAction.value = null;
}

async function onConfirmNewFile(name: string) {
  const a = pendingAction.value;
  if (!a || a.kind !== 'new-file') return;
  pendingAction.value = null;
  try {
    const created = await ws.createFile(a.parent, name);
    emit('open-file', created);
  } catch (e) {
    console.error('createFile:', e);
    window.alert(String(e));
  }
}

async function onConfirmNewFolder(name: string) {
  const a = pendingAction.value;
  if (!a || a.kind !== 'new-folder') return;
  pendingAction.value = null;
  try {
    await ws.createFolder(a.parent, name);
  } catch (e) {
    console.error('createFolder:', e);
    window.alert(String(e));
  }
}

async function onConfirmRename(newName: string) {
  const a = pendingAction.value;
  if (!a || a.kind !== 'rename') return;
  pendingAction.value = null;
  if (newName === a.originalName) return;
  const sepIdx = Math.max(a.from.lastIndexOf('/'), a.from.lastIndexOf('\\'));
  const sep = a.from.includes('\\') && (sepIdx === -1 || a.from[sepIdx] === '\\') ? '\\' : '/';
  const parent = sepIdx >= 0 ? a.from.slice(0, sepIdx) : '';
  const dest = parent ? `${parent}${sep}${newName}` : newName;
  try {
    await ws.renamePath(a.from, dest);
  } catch (e) {
    console.error('rename:', e);
    window.alert(String(e));
  }
}

async function onConfirmDelete() {
  const a = pendingAction.value;
  if (!a) return;
  pendingAction.value = null;
  if (a.kind === 'delete') {
    try {
      await ws.deletePath(a.path);
    } catch (e) {
      console.error('delete:', e);
      window.alert(String(e));
    }
    return;
  }
  if (a.kind === 'delete-many') {
    for (const p of a.paths) {
      try {
        await ws.deletePath(p);
      } catch (e) {
        console.error('delete:', p, e);
      }
    }
    ws.clearSelection();
  }
}

function validateNewFileName(v: string): string | null {
  const trimmed = v.trim();
  if (!trimmed) return null; // disabled, no error message
  if (/[/\\]/.test(trimmed)) return t.value.workspaceErrorNoPathSeparators;
  if (trimmed === '.' || trimmed === '..') return t.value.workspaceErrorReservedName;
  return null;
}

// ===== Header menu =====
async function pickFolder() {
  showHeaderMenu.value = false;
  try { await ws.openWorkspaceDialog(); } catch (e) { console.error('open:', e); }
}

function openRecent(path: string) {
  showHeaderMenu.value = false;
  ws.openWorkspace(path).catch((e) => console.error('open recent:', e));
}

function closeAll() {
  showHeaderMenu.value = false;
  ws.closeAllWorkspaces();
}

function expandAll() {
  showHeaderMenu.value = false;
  ws.expandAllWorkspaceSections();
}

function collapseAll() {
  showHeaderMenu.value = false;
  ws.collapseAllWorkspaceSections();
}

function refreshAll() {
  showHeaderMenu.value = false;
  ws.refreshAll();
}

// Active workspace = the one whose root contains the currently open file.
// Falls back to the explicitly-selected one (settings.activeWorkspaceId).
const activeContextWorkspaceId = computed<string | null>(() => {
  const hl = ws.highlightedPath.value;
  if (hl) {
    const owning = ws.findOwningWorkspace(hl);
    if (owning) return owning.id;
  }
  return ws.activeWorkspaceId.value;
});

/**
 * Where a "new file" header click should drop the file. Priority:
 *   1. Workspace owning the active editor file (you're working there).
 *   2. The settings-flagged active workspace (last clicked tab/section).
 *   3. The first open workspace (best-effort default for single-workspace users).
 *   4. None — the button is hidden if no workspace is open.
 */
const targetWorkspaceForNewFile = computed(() => {
  const hl = ws.highlightedPath.value;
  if (hl) {
    const owning = ws.findOwningWorkspace(hl);
    if (owning) return owning;
  }
  if (ws.activeWorkspace.value) return ws.activeWorkspace.value;
  return ws.openWorkspaces.value[0] ?? null;
});

function startNewFileInActiveWorkspace() {
  const target = targetWorkspaceForNewFile.value;
  if (!target) return;
  pendingAction.value = { kind: 'new-file', parent: target.rootPath };
}

// ===== Internal drag (tree move, drop into editor, section reorder) =====
// Pointer events, not HTML5 drag & drop: Tauri's native drag-drop handler owns
// the webview's drop target (that is what delivers absolute OS paths), and on
// WebView2 that also disables page-internal HTML5 drags. Pointer events are
// independent of that pipeline.
const dragOverFolderPath = ref<string | null>(null);
const sectionDropIndex = ref<number | null>(null);
const dragGhost = ref<{ label: string; x: number; y: number } | null>(null);

interface DragState {
  pointerId: number;
  origin: Point;
  source: DragSource;
  paths: string[];
  active: boolean;
}

let drag: DragState | null = null;
let swallowNextClick = false;
let autoScrollFrame: number | null = null;
let autoScrollX = 0;
let autoScrollY = 0;

function ghostLabel(source: DragSource, paths: string[]): string {
  if (source.kind === 'section') return ws.openWorkspaces.value[source.index]?.name ?? '';
  if (paths.length > 1) return `${paths.length} ${t.value.workspaceItemsLabel}`;
  return basenameOf(source.path);
}

function onSidebarPointerDown(ev: PointerEvent) {
  swallowNextClick = false;
  if (ev.button !== 0 || drag) return;
  const source = resolveDragSource(ev.target as Element | null);
  if (!source) return;
  drag = {
    pointerId: ev.pointerId,
    origin: { x: ev.clientX, y: ev.clientY },
    source,
    paths: [],
    active: false,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragUp);
  window.addEventListener('pointercancel', onDragCancel);
  window.addEventListener('keydown', onDragKeyDown, true);
}

function activateDrag(point: Point) {
  if (!drag) return;
  drag.active = true;
  if (drag.source.kind === 'node') {
    drag.paths = ws.dragSelectionFor(drag.source.path);
  } else {
    sectionDropIndex.value = drag.source.index;
  }
  try {
    sidebarRootEl.value?.setPointerCapture(drag.pointerId);
  } catch {
    // Pointer already released — the drag still works off the window listeners.
  }
  document.body.style.userSelect = 'none';
  dragGhost.value = { label: ghostLabel(drag.source, drag.paths), ...point };
}

function onDragMove(ev: PointerEvent) {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  const point = { x: ev.clientX, y: ev.clientY };
  if (!drag.active) {
    if (!exceedsThreshold(drag.origin, point)) return;
    activateDrag(point);
  }
  if (dragGhost.value) dragGhost.value = { ...dragGhost.value, ...point };
  paintDropTarget(point);
  runAutoScroll(point);
}

function paintDropTarget(point: Point) {
  if (!drag) return;
  const hit = resolveDropHit(document.elementFromPoint(point.x, point.y));
  if (drag.source.kind === 'section') {
    sectionDropIndex.value = hit.sectionIndex ?? drag.source.index;
    return;
  }
  dragOverFolderPath.value = hit.nodeKind === 'folder' ? hit.nodePath : null;
  ws.setDropTargetPane(hit.paneId);
}

async function onDragUp(ev: PointerEvent) {
  if (!drag || ev.pointerId !== drag.pointerId) return;
  const { source, paths, active } = drag;
  const point = { x: ev.clientX, y: ev.clientY };
  endDrag();
  if (!active) return;
  swallowNextClick = true;

  const hit = resolveDropHit(document.elementFromPoint(point.x, point.y));
  if (source.kind === 'section') {
    if (hit.sectionIndex !== null) ws.reorderOpenWorkspaces(source.index, hit.sectionIndex);
    return;
  }
  if (hit.nodeKind === 'folder' && hit.nodePath) {
    await applyMoves(paths, hit.nodePath);
    return;
  }
  if (hit.paneId && source.nodeKind === 'file' && paths.length > 0) {
    emit('drop-in-pane', { paneId: hit.paneId, paths });
  }
}

function onDragCancel() {
  const wasActive = drag?.active === true;
  endDrag();
  if (wasActive) swallowNextClick = true;
}

function onDragKeyDown(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return;
  ev.preventDefault();
  ev.stopPropagation();
  onDragCancel();
}

function endDrag() {
  if (!drag) return;
  const { pointerId, active } = drag;
  drag = null;
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragUp);
  window.removeEventListener('pointercancel', onDragCancel);
  window.removeEventListener('keydown', onDragKeyDown, true);
  stopAutoScroll();
  if (active) {
    try {
      sidebarRootEl.value?.releasePointerCapture(pointerId);
    } catch {
      // Capture already lost; nothing to release.
    }
    document.body.style.userSelect = '';
  }
  dragGhost.value = null;
  dragOverFolderPath.value = null;
  sectionDropIndex.value = null;
  ws.setDropTargetPane(null);
}

async function applyMoves(sources: string[], destFolder: string) {
  for (const op of planMoves(sources, destFolder)) {
    try {
      await ws.renamePath(op.from, op.to);
    } catch (e) {
      console.error('move:', e);
      window.alert(String(e));
    }
  }
}

// A drag that ends on a row would otherwise fire a click and reselect it.
function onDocClickCapture(ev: MouseEvent) {
  if (!swallowNextClick) return;
  swallowNextClick = false;
  ev.preventDefault();
  ev.stopPropagation();
}

function runAutoScroll(point: Point) {
  autoScrollX = point.x;
  autoScrollY = point.y;
  if (autoScrollFrame !== null) return;
  const tick = () => {
    const body = sidebarEl.value;
    if (!drag?.active || !body) {
      autoScrollFrame = null;
      return;
    }
    const step = autoScrollStep(autoScrollY, body.getBoundingClientRect());
    if (step !== 0) {
      body.scrollTop += step;
      // Rows slide under a stationary pointer while auto-scrolling.
      paintDropTarget({ x: autoScrollX, y: autoScrollY });
    }
    autoScrollFrame = requestAnimationFrame(tick);
  };
  autoScrollFrame = requestAnimationFrame(tick);
}

function stopAutoScroll() {
  if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = null;
}

// ===== Resize handle =====
const resizing = ref(false);
let startX = 0;
let startWidth = 0;

function onResizeStart(e: PointerEvent) {
  resizing.value = true;
  startX = e.clientX;
  startWidth = ws.sidebarWidth.value;
  document.addEventListener('pointermove', onResizeMove);
  document.addEventListener('pointerup', onResizeEnd, { once: true });
}
function onResizeMove(e: PointerEvent) {
  if (!resizing.value) return;
  const next = startWidth + (e.clientX - startX);
  ws.setSidebarWidth(Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, next)));
}
function onResizeEnd() {
  resizing.value = false;
  document.removeEventListener('pointermove', onResizeMove);
}

const widthPx = computed(() => `${ws.sidebarWidth.value}px`);
const hasOpen = computed(() => ws.openWorkspaces.value.length > 0);

const sidebarEl = ref<HTMLElement | null>(null);
const sidebarRootEl = ref<HTMLElement | null>(null);
const headerMenuRoot = ref<HTMLElement | null>(null);

// Close the header (3-dots) menu when clicking anywhere outside it.
function onDocMouseDown(e: MouseEvent) {
  if (!showHeaderMenu.value) return;
  const target = e.target as Node | null;
  if (headerMenuRoot.value && target && headerMenuRoot.value.contains(target)) return;
  showHeaderMenu.value = false;
}

// Click outside any row clears the selection. Children with stopPropagation
// (rows) won't trigger this. Folder/file rows handle their own selection.
function onBodyMouseDown(e: MouseEvent) {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  if (target.closest('.tree-row') || target.closest('.ws-section-header')) return;
  ws.clearSelection();
}

// Delete key removes selected nodes after a single confirm dialog.
function onKeyDown(e: KeyboardEvent) {
  // Ignore when typing in an input/textarea/contenteditable inside the sidebar.
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  if (ws.selectedPaths.value.size === 0) return;
  e.preventDefault();
  const paths = Array.from(ws.selectedPaths.value);
  // Multi delete dialog: reuse single confirm. Name shows count if >1.
  const first = paths[0].split(/[/\\]/).pop() || paths[0];
  const label = paths.length === 1 ? first : `${paths.length} ${t.value.workspaceItemsLabel}`;
  pendingAction.value = { kind: 'delete-many', paths, name: label };
}

watch(
  () => ws.revealSignal.value,
  async (signal) => {
    if (!signal) return;
    await nextTick();
    const el = sidebarEl.value?.querySelector<HTMLElement>(`[data-ws-id="${signal.id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('mousedown', onDocMouseDown);
  document.addEventListener('click', onDocClickCapture, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('click', onDocClickCapture, true);
  endDrag();
});
</script>

<template>
  <aside
    ref="sidebarRootEl"
    class="workspace-sidebar"
    :class="{ resizing, 'folder-drop-active': folderDropActive }"
    :style="{ width: widthPx }"
    @pointerdown="onSidebarPointerDown"
  >
    <div v-if="folderDropActive" class="ws-folder-drop-hint">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <line x1="12" y1="11" x2="12" y2="17"/>
        <line x1="9" y1="14" x2="15" y2="14"/>
      </svg>
      <span>{{ t.dropFolderHere }}</span>
    </div>

    <header class="ws-header">
      <span class="ws-title">{{ t.workspaces }}</span>
      <span v-if="hasOpen" class="ws-count">{{ ws.openWorkspaces.value.length }}</span>

      <!-- Search: quick switcher (workspaces / files / content). -->
      <button
        v-if="hasOpen"
        class="ws-header-btn"
        v-tooltip="t.workspaceQuickSwitcher"
        @click="emit('open-quick-switcher')"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>

      <!-- Sort: opens a menu to set the global default order. -->
      <button
        v-if="hasOpen"
        class="ws-header-btn"
        v-tooltip="t.workspaceSortMenu"
        @click="openGlobalSortMenu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="13" y2="6"/>
          <line x1="4" y1="12" x2="11" y2="12"/>
          <line x1="4" y1="18" x2="9" y2="18"/>
          <polyline points="17 8 20 5 20 5"/>
          <path d="M20 5v14l-3-3"/>
        </svg>
      </button>

      <!-- New file: creates an empty .md in the active workspace root. -->
      <button
        v-if="targetWorkspaceForNewFile"
        class="ws-header-btn"
        v-tooltip="t.newFileInWorkspaceTooltip(targetWorkspaceForNewFile.name)"
        @click="startNewFileInActiveWorkspace"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
      </button>

      <!-- Open folder: adds a workspace. Distinct from "new file" above. -->
      <button
        class="ws-header-btn"
        v-tooltip="t.openFolder"
        @click="pickFolder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <line x1="12" y1="11" x2="12" y2="17"/>
          <line x1="9" y1="14" x2="15" y2="14"/>
        </svg>
      </button>

      <div ref="headerMenuRoot" class="ws-header-menu-root">
      <button
        class="ws-header-btn"
        v-tooltip="t.workspace"
        @click="showHeaderMenu = !showHeaderMenu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="5" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      <div v-if="showHeaderMenu" class="ws-menu">
        <button class="ws-menu-item" @click="pickFolder">{{ t.openFolder }}</button>
        <button v-if="hasOpen" class="ws-menu-item" @click="refreshAll">{{ t.refreshTree }}</button>
        <button v-if="hasOpen" class="ws-menu-item" @click="expandAll">{{ t.expandAllSections }}</button>
        <button v-if="hasOpen" class="ws-menu-item" @click="collapseAll">{{ t.collapseAllSections }}</button>
        <button v-if="hasOpen" class="ws-menu-item" @click="closeAll">{{ t.closeAllWorkspaces }}</button>
        <template v-if="ws.recentWorkspaces.value.length">
          <div class="ws-menu-divider"></div>
          <div class="ws-menu-section">{{ t.recentWorkspaces }}</div>
          <button
            v-for="r in ws.recentWorkspaces.value"
            :key="r"
            class="ws-menu-item recent"
            v-tooltip="r"
            @click="openRecent(r)"
          >
            {{ r.split(/[\/\\]/).filter(Boolean).slice(-1)[0] || r }}
          </button>
        </template>
      </div>
      </div>
    </header>

    <div class="ws-body" ref="sidebarEl" @mousedown="onBodyMouseDown">
      <div v-if="!hasOpen" class="ws-empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
        <p class="ws-empty-hint">{{ t.workspaceEmptyHint }}</p>
        <button class="ws-empty-btn" @click="pickFolder">{{ t.openFolder }}</button>
        <p v-if="ws.recentWorkspaces.value.length" class="ws-empty-recent-hint">
          {{ t.workspaceEmptyRecentHint }}
        </p>
      </div>

      <template v-else>
        <WorkspaceSection
          v-for="(w, idx) in ws.openWorkspaces.value"
          :key="w.id"
          :workspace="w"
          :index="idx"
          :is-active-context="activeContextWorkspaceId === w.id"
          :drag-over-path="dragOverFolderPath"
          :is-reorder-target="sectionDropIndex === idx"
          @open-file="(p) => emit('open-file', p)"
          @view-changes="(p) => emit('view-changes', p)"
          @sort-folder="onFolderSortRequest"
          @context="openContext"
          @new-file-at="(parent) => (pendingAction = { kind: 'new-file', parent })"
          @new-folder-at="(parent) => (pendingAction = { kind: 'new-folder', parent })"
        />

        <button
          class="ws-add-btn"
          @click="pickFolder"
          v-tooltip="t.openFolder"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ t.addWorkspace }}
        </button>
      </template>
    </div>

    <div
      class="ws-resize-handle"
      @pointerdown="onResizeStart"
    ></div>

    <WorkspaceContextMenu
      v-if="ctxNode"
      :x="ctxX"
      :y="ctxY"
      :kind="ctxNode.kind"
      :is-root="ctxIsRoot"
      @action="onContextAction"
      @close="closeContext"
    />

    <WorkspaceSortMenu
      v-if="sortMenu"
      :x="sortMenu.x"
      :y="sortMenu.y"
      :current="sortMenuCurrent"
      :allow-inherit="sortMenu.scope === 'folder'"
      :has-override="sortMenuHasOverride"
      @select="onSortMenuSelect"
      @close="sortMenu = null"
    />

    <!-- Styled prompts replacing native window.prompt / confirm -->
    <WorkspaceInputDialog
      v-if="pendingAction?.kind === 'new-file'"
      :title="t.workspaceContextNewFile"
      :label="t.workspaceNewFilePrompt"
      initial-value="untitled.md"
      :placeholder="'untitled.md'"
      :confirm-label="t.create"
      :cancel-label="t.cancel"
      :validate="validateNewFileName"
      :select-basename="true"
      @confirm="onConfirmNewFile"
      @cancel="dismissDialog"
    />

    <WorkspaceInputDialog
      v-if="pendingAction?.kind === 'new-folder'"
      :title="t.workspaceContextNewFolder"
      :label="t.workspaceNewFolderPrompt"
      initial-value="folder"
      :placeholder="'folder'"
      :confirm-label="t.create"
      :cancel-label="t.cancel"
      :validate="validateNewFileName"
      @confirm="onConfirmNewFolder"
      @cancel="dismissDialog"
    />

    <WorkspaceInputDialog
      v-if="pendingAction?.kind === 'rename'"
      :title="t.workspaceContextRename"
      :label="t.workspaceRenamePrompt"
      :initial-value="pendingAction.originalName"
      :confirm-label="t.rename"
      :cancel-label="t.cancel"
      :validate="validateNewFileName"
      :select-basename="true"
      @confirm="onConfirmRename"
      @cancel="dismissDialog"
    />

    <WorkspaceConfirmDialog
      v-if="pendingAction?.kind === 'delete' || pendingAction?.kind === 'delete-many'"
      :title="t.workspaceContextDelete"
      :message="t.workspaceConfirmDelete(pendingAction.name)"
      :confirm-label="t.workspaceContextDelete"
      :cancel-label="t.cancel"
      danger
      @confirm="onConfirmDelete"
      @cancel="dismissDialog"
    />

    <Teleport to="body">
      <div
        v-if="dragGhost"
        class="ws-drag-ghost"
        :style="{ left: `${dragGhost.x + 14}px`, top: `${dragGhost.y + 14}px` }"
      >{{ dragGhost.label }}</div>
    </Teleport>
  </aside>
</template>

<style scoped>
.workspace-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-primary);
  flex-shrink: 0;
  overflow: hidden;
}

.workspace-sidebar.resizing {
  user-select: none;
}

/* Directory drag hovering the window — the sidebar is the drop target (#124). */
.workspace-sidebar.folder-drop-active::after {
  content: '';
  position: absolute;
  inset: 2px;
  border: 2px dashed var(--primary, #3b82f6);
  border-radius: 8px;
  pointer-events: none;
  z-index: 20;
}

.ws-folder-drop-hint {
  position: absolute;
  inset: 2px;
  z-index: 21;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  text-align: center;
  background: var(--bg-secondary);
  color: var(--primary, #3b82f6);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  pointer-events: none;
}

/* ===== Top header ===== */
.ws-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 6px 10px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  flex-shrink: 0;
  height: 32px;
}

.ws-title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.ws-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 5px;
  height: 16px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
}

.ws-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.ws-header-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.ws-header-btn--active {
  color: var(--primary);
}

/* Wrapper has no box so the flex header layout and the absolute menu
   positioning are unaffected; it only exists as a click-outside boundary. */
.ws-header-menu-root {
  display: contents;
}

.ws-menu {
  position: absolute;
  top: 100%;
  right: 4px;
  min-width: 220px;
  max-width: 360px;
  z-index: 100;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: var(--shadow-dropdown);
  padding: 4px;
}

.ws-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  font-size: 13px;
  background: none;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: 4px;
}

.ws-menu-item:hover {
  background: var(--hover-bg);
}

.ws-menu-item.recent {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-menu-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}

.ws-menu-section {
  padding: 4px 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

/* ===== Body ===== */
.ws-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.ws-body::-webkit-scrollbar {
  width: 8px;
}
.ws-body::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}
.ws-body::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Empty state */
.ws-empty {
  padding: 36px 20px 24px;
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  text-align: center;
}

.ws-empty svg {
  color: var(--text-faint);
  margin-bottom: 4px;
}

.ws-empty-hint {
  margin: 0;
  line-height: 1.5;
}

.ws-empty-btn {
  padding: 7px 14px;
  font-size: 13px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.ws-empty-btn:hover {
  background: var(--primary-hover);
}

.ws-empty-recent-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-faint);
}

/* "+ Add workspace" button below sections */
.ws-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 12px);
  margin: 8px 6px;
  padding: 6px 10px;
  border: 1px dashed var(--border-secondary);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.ws-add-btn:hover {
  border-style: solid;
  border-color: var(--primary);
  color: var(--primary);
}

/* Cursor-following label for an in-flight tree / section drag. */
.ws-drag-ghost {
  position: fixed;
  z-index: 99999;
  max-width: 260px;
  padding: 4px 10px;
  border-radius: 5px;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: var(--shadow-dropdown);
  pointer-events: none;
}

/* Resize handle */
.ws-resize-handle {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}

.ws-resize-handle:hover {
  background: rgba(var(--primary-rgb, 37, 99, 235), 0.2);
}
</style>
