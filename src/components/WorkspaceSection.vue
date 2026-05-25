<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace, type WorkspaceNode } from '../composables/useWorkspace';
import type { OpenWorkspaceEntry } from '../composables/useSettings';
import type { WorkspaceSortMode } from '../utils/workspace-sort';
import FileTreeNode from './FileTreeNode.vue';
import WorkspaceSortMenu from './WorkspaceSortMenu.vue';

/**
 * One workspace as a collapsible section in the sidebar (VS Code "Folders"
 * style). Multiple sections stack vertically; the user can collapse the ones
 * they're not using. Each section exposes the workspace's tree, an active
 * indicator (for the section that owns the current file), and a hover menu
 * with refresh / reveal / close.
 */

const { t } = useI18n();
const ws = useWorkspace();

const props = defineProps<{
  workspace: OpenWorkspaceEntry;
  /** When true, this workspace owns the currently active editor file. */
  isActiveContext: boolean;
  /** Drop-target highlight for the in-tree drag&drop (move file to folder). */
  dragOverPath: string | null;
  /** Index in the parent list — used as the dataTransfer payload for reorder. */
  index: number;
}>();

const emit = defineEmits<{
  (e: 'open-file', path: string): void;
  (e: 'view-changes', path: string): void;
  (e: 'sort-folder', payload: { path: string; x: number; y: number }): void;
  (e: 'context', payload: { x: number; y: number; node: WorkspaceNode }): void;
  (e: 'node-dragstart', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
  (e: 'node-dragover', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
  (e: 'node-dragleave', payload: { path: string; kind: 'file' | 'folder' }): void;
  (e: 'node-drop', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
  /** Section header dragged — used for section reorder in the parent. */
  (e: 'section-dragstart', payload: { index: number; ev: DragEvent }): void;
  (e: 'section-dragover', payload: { index: number; ev: DragEvent }): void;
  (e: 'section-drop', payload: { index: number; ev: DragEvent }): void;
  (e: 'section-dragend'): void;
  /** New file/folder inside this workspace's root — bubbles up to the
   *  sidebar so the same pending-action dialog flow handles it. */
  (e: 'new-file-at', parent: string): void;
  (e: 'new-folder-at', parent: string): void;
}>();

const collapsed = computed(() => ws.isWorkspaceSectionCollapsed(props.workspace.id));
const tree = computed<WorkspaceNode | null>(() => ws.treesById.value[props.workspace.id] ?? null);

const menuRoot = ref<HTMLElement | null>(null);

// Per-workspace sort menu (overrides the global default for this section).
const sortMenu = ref<{ x: number; y: number } | null>(null);
const sortCurrent = computed<WorkspaceSortMode>(() => ws.effectiveSortMode(null, props.workspace.id));
const sortHasOverride = computed<boolean>(() => !!ws.sortByWorkspace.value[props.workspace.id]);

function openSortMenu(ev: MouseEvent) {
  ev.stopPropagation();
  const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
  sortMenu.value = { x: r.left, y: r.bottom + 4 };
}
function onSortSelect(mode: WorkspaceSortMode | null) {
  ws.setWorkspaceSort(props.workspace.id, mode);
}

function toggleCollapsed() {
  ws.toggleWorkspaceSection(props.workspace.id);
}

async function refresh() {
  // Drop the cached tree, then ask the composable to refresh all open
  // workspaces — cheap because Tauri walks each in parallel.
  ws.treesById.value[props.workspace.id] = null;
  await ws.refreshAll();
}

function close() {
  ws.closeWorkspaceById(props.workspace.id);
}

async function reveal() {
  try { await ws.revealInOs(props.workspace.rootPath); } catch (e) { console.error('reveal:', e); }
}

function onHeaderDragStart(ev: DragEvent) {
  emit('section-dragstart', { index: props.index, ev });
}
function onHeaderDragOver(ev: DragEvent) {
  emit('section-dragover', { index: props.index, ev });
}
function onHeaderDrop(ev: DragEvent) {
  emit('section-drop', { index: props.index, ev });
}
function onHeaderDragEnd() {
  emit('section-dragend');
}

function onHeaderContextMenu(ev: MouseEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  // Synthesize a folder node for the workspace root so the existing context
  // menu / pending-action flow can target it (new file, new folder, reveal).
  const rootNode: WorkspaceNode = {
    name: props.workspace.name || props.workspace.rootPath,
    path: props.workspace.rootPath,
    kind: 'folder',
    children: tree.value?.children ?? [],
  };
  emit('context', { x: ev.clientX, y: ev.clientY, node: rootNode });
}

function newFileHere(ev: MouseEvent) {
  ev.stopPropagation();
  emit('new-file-at', props.workspace.rootPath);
}
function newFolderHere(ev: MouseEvent) {
  ev.stopPropagation();
  emit('new-folder-at', props.workspace.rootPath);
}
</script>

<template>
  <section class="ws-section" :class="{ active: isActiveContext, collapsed }">
    <header
      class="ws-section-header"
      :class="{ active: isActiveContext }"
      draggable="true"
      @click="toggleCollapsed"
      @contextmenu="onHeaderContextMenu"
      @dragstart="onHeaderDragStart"
      @dragover="onHeaderDragOver"
      @drop="onHeaderDrop"
      @dragend="onHeaderDragEnd"
    >
      <span class="ws-section-chevron" :class="{ expanded: !collapsed }">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </span>

      <span class="ws-section-name" v-tooltip="workspace.rootPath">
        {{ workspace.name || workspace.rootPath }}
      </span>

      <span v-if="isActiveContext" class="ws-section-active-dot" v-tooltip="t.activeWorkspaceContext"></span>

      <div ref="menuRoot" class="ws-section-actions" @click.stop>
        <button
          class="ws-section-action"
          :class="{ 'ws-section-action--active': sortHasOverride }"
          v-tooltip="t.workspaceSortMenu"
          @click="openSortMenu"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="4" y1="6" x2="13" y2="6"/>
            <line x1="4" y1="12" x2="11" y2="12"/>
            <line x1="4" y1="18" x2="9" y2="18"/>
            <polyline points="17 8 20 5 20 5"/>
            <path d="M20 5v14l-3-3"/>
          </svg>
        </button>
        <button
          class="ws-section-action"
          v-tooltip="t.workspaceContextNewFile"
          @click="newFileHere"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button
          class="ws-section-action"
          v-tooltip="t.workspaceContextNewFolder"
          @click="newFolderHere"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <button
          class="ws-section-action"
          v-tooltip="t.refreshTree"
          @click.stop="refresh"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
            <polyline points="21 3 21 8 16 8"/>
          </svg>
        </button>
        <button
          class="ws-section-action"
          v-tooltip="t.workspaceContextRevealInOs"
          @click.stop="reveal"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 3h7v7"/>
            <path d="M10 14L21 3"/>
            <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>
          </svg>
        </button>
        <button
          class="ws-section-action danger"
          v-tooltip="t.closeWorkspace"
          @click.stop="close"
        >×</button>
      </div>
    </header>

    <div v-if="!collapsed" class="ws-section-body">
      <div v-if="!tree && !ws.error.value" class="ws-section-skeleton">
        <div class="skel-row" v-for="n in 4" :key="n" :style="{ width: 50 + ((n * 13) % 35) + '%' }"></div>
      </div>
      <div v-else-if="ws.error.value && ws.activeWorkspaceId.value === workspace.id" class="ws-section-error">
        {{ t.workspaceErrorLoad }}
      </div>
      <FileTreeNode
        v-if="tree"
        :node="tree"
        :depth="0"
        :is-root="true"
        :drag-over-path="dragOverPath"
        :workspace-id="workspace.id"
        @open-file="(p) => emit('open-file', p)"
        @view-changes="(p) => emit('view-changes', p)"
        @sort-folder="(payload) => emit('sort-folder', payload)"
        @context="(payload) => emit('context', payload)"
        @node-dragstart="(payload) => emit('node-dragstart', payload)"
        @node-dragover="(payload) => emit('node-dragover', payload)"
        @node-dragleave="(payload) => emit('node-dragleave', payload)"
        @node-drop="(payload) => emit('node-drop', payload)"
      />
    </div>

    <WorkspaceSortMenu
      v-if="sortMenu"
      :x="sortMenu.x"
      :y="sortMenu.y"
      :current="sortCurrent"
      :allow-inherit="true"
      :has-override="sortHasOverride"
      @select="onSortSelect"
      @close="sortMenu = null"
    />
  </section>
</template>

<style scoped>
.ws-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.ws-section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 4px;
  background: var(--bg-secondary);
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-primary);
  position: sticky;
  top: 0;
  z-index: 5;
}

.ws-section-header:hover {
  background: var(--hover-bg);
  color: var(--text-secondary);
}

.ws-section-header.active {
  color: var(--primary);
}

.ws-section-chevron {
  display: flex;
  width: 12px;
  color: var(--text-faint);
  transition: transform 0.12s ease;
  pointer-events: none;
}

.ws-section-chevron svg {
  pointer-events: none;
}

.ws-section-chevron.expanded {
  transform: rotate(90deg);
}

.ws-section-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-section-active-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  margin-right: 2px;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--bg-secondary);
}

.ws-section-actions {
  display: flex;
  gap: 2px;
  /* Always visible — these actions (sort, new file/folder, refresh, reveal,
     close) were hover-only and undiscoverable. Muted by default, full
     contrast on row hover. */
  opacity: 0.65;
  transition: opacity 0.12s ease;
}

.ws-section-header:hover .ws-section-actions {
  opacity: 1;
}

.ws-section-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
}

.ws-section-action:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.ws-section-action--active {
  color: var(--primary);
  opacity: 1;
}

.ws-section-action.danger:hover {
  background: var(--danger-text-bg);
  color: var(--danger);
}

.ws-section-body {
  padding: 2px 0 6px;
}

.ws-section-skeleton {
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skel-row {
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--bg-tertiary) 25%, var(--hover-bg) 50%, var(--bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.4s ease-in-out infinite;
}

@keyframes skel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.ws-section-error {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--danger);
}
</style>
