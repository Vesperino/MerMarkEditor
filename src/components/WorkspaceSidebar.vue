<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace, type WorkspaceNode } from '../composables/useWorkspace';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '../composables/useSettings';
import WorkspaceSection from './WorkspaceSection.vue';
import WorkspaceContextMenu, { type WorkspaceContextAction } from './WorkspaceContextMenu.vue';
import WorkspaceInputDialog from './WorkspaceInputDialog.vue';
import WorkspaceConfirmDialog from './WorkspaceConfirmDialog.vue';

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

const emit = defineEmits<{
  (e: 'open-file', path: string): void;
  (e: 'open-quick-switcher'): void;
}>();

const showHeaderMenu = ref(false);

// ===== Context menu state (right-click on tree node) =====
const ctxX = ref(0);
const ctxY = ref(0);
const ctxNode = ref<WorkspaceNode | null>(null);

function openContext(payload: { x: number; y: number; node: WorkspaceNode }) {
  ctxX.value = payload.x;
  ctxY.value = payload.y;
  ctxNode.value = payload.node;
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
  | { kind: 'delete'; path: string; name: string };

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
    pendingAction.value = { kind: 'delete', path: node.path, name: node.name };
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
  if (!a || a.kind !== 'delete') return;
  pendingAction.value = null;
  try {
    await ws.deletePath(a.path);
  } catch (e) {
    console.error('delete:', e);
    window.alert(String(e));
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

// ===== Tree drag&drop (file -> folder = move via rename) =====
const dragOverFolderPath = ref<string | null>(null);

function onTreeDragStart(payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }) {
  if (!payload.ev.dataTransfer) return;
  payload.ev.dataTransfer.setData('application/x-mermark-ws-node', JSON.stringify({ path: payload.path, kind: payload.kind }));
  payload.ev.dataTransfer.effectAllowed = 'copyMove';
}
function onTreeDragOver(payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }) {
  if (payload.kind !== 'folder') return;
  payload.ev.preventDefault();
  if (payload.ev.dataTransfer) payload.ev.dataTransfer.dropEffect = 'move';
  dragOverFolderPath.value = payload.path;
}
function onTreeDragLeave(payload: { path: string }) {
  if (dragOverFolderPath.value === payload.path) dragOverFolderPath.value = null;
}
async function onTreeDrop(payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }) {
  payload.ev.preventDefault();
  dragOverFolderPath.value = null;
  if (payload.kind !== 'folder') return;
  const raw = payload.ev.dataTransfer?.getData('application/x-mermark-ws-node');
  if (!raw) return;
  let info: { path: string; kind: 'file' | 'folder' };
  try { info = JSON.parse(raw); } catch { return; }
  if (info.path === payload.path) return;
  const fromName = info.path.split(/[/\\]/).pop() || '';
  if (!fromName) return;
  const sep = payload.path.includes('\\') ? '\\' : '/';
  const dest = `${payload.path}${sep}${fromName}`;
  if (dest === info.path) return;
  if (info.kind === 'folder' && payload.path.startsWith(info.path)) return;
  try {
    await ws.renamePath(info.path, dest);
  } catch (e) {
    console.error('move:', e);
    window.alert(String(e));
  }
}

// ===== Section reorder (drag the section header) =====
const SECTION_DRAG_TYPE = 'application/x-mermark-ws-section';
const sectionDragFromIndex = ref<number | null>(null);

function onSectionDragStart(payload: { index: number; ev: DragEvent }) {
  sectionDragFromIndex.value = payload.index;
  if (payload.ev.dataTransfer) {
    payload.ev.dataTransfer.setData(SECTION_DRAG_TYPE, String(payload.index));
    payload.ev.dataTransfer.effectAllowed = 'move';
  }
}
function onSectionDragOver(payload: { index: number; ev: DragEvent }) {
  if (sectionDragFromIndex.value === null) return;
  payload.ev.preventDefault();
  if (payload.ev.dataTransfer) payload.ev.dataTransfer.dropEffect = 'move';
}
function onSectionDrop(payload: { index: number; ev: DragEvent }) {
  payload.ev.preventDefault();
  const from = sectionDragFromIndex.value;
  sectionDragFromIndex.value = null;
  if (from === null || from === payload.index) return;
  ws.reorderOpenWorkspaces(from, payload.index);
}
function onSectionDragEnd() {
  sectionDragFromIndex.value = null;
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
</script>

<template>
  <aside
    class="workspace-sidebar"
    :class="{ resizing }"
    :style="{ width: widthPx }"
  >
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
    </header>

    <div class="ws-body">
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
          @open-file="(p) => emit('open-file', p)"
          @context="openContext"
          @node-dragstart="onTreeDragStart"
          @node-dragover="onTreeDragOver"
          @node-dragleave="onTreeDragLeave"
          @node-drop="onTreeDrop"
          @section-dragstart="onSectionDragStart"
          @section-dragover="onSectionDragOver"
          @section-drop="onSectionDrop"
          @section-dragend="onSectionDragEnd"
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
      @action="onContextAction"
      @close="closeContext"
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
      v-if="pendingAction?.kind === 'delete'"
      :title="t.workspaceContextDelete"
      :message="t.workspaceConfirmDelete(pendingAction.name)"
      :confirm-label="t.workspaceContextDelete"
      :cancel-label="t.cancel"
      danger
      @confirm="onConfirmDelete"
      @cancel="dismissDialog"
    />
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
