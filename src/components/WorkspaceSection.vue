<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace, type WorkspaceNode } from '../composables/useWorkspace';
import type { OpenWorkspaceEntry } from '../composables/useSettings';
import FileTreeNode from './FileTreeNode.vue';

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
}>();

const collapsed = computed(() => ws.isWorkspaceSectionCollapsed(props.workspace.id));
const tree = computed<WorkspaceNode | null>(() => ws.treesById.value[props.workspace.id] ?? null);

const menuRoot = ref<HTMLElement | null>(null);

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
</script>

<template>
  <section class="ws-section" :class="{ active: isActiveContext, collapsed }">
    <header
      class="ws-section-header"
      :class="{ active: isActiveContext }"
      draggable="true"
      @click="toggleCollapsed"
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

      <span class="ws-section-name" :title="workspace.rootPath">
        {{ workspace.name || workspace.rootPath }}
      </span>

      <span v-if="isActiveContext" class="ws-section-active-dot" :title="t.activeWorkspaceContext"></span>

      <div ref="menuRoot" class="ws-section-actions" @click.stop>
        <button
          class="ws-section-action"
          :title="t.refreshTree"
          @click.stop="refresh"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8"/>
            <polyline points="21 3 21 8 16 8"/>
          </svg>
        </button>
        <button
          class="ws-section-action"
          :title="t.workspaceContextRevealInOs"
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
          :title="t.closeWorkspace"
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
        @open-file="(p) => emit('open-file', p)"
        @context="(payload) => emit('context', payload)"
        @node-dragstart="(payload) => emit('node-dragstart', payload)"
        @node-dragover="(payload) => emit('node-dragover', payload)"
        @node-dragleave="(payload) => emit('node-dragleave', payload)"
        @node-drop="(payload) => emit('node-drop', payload)"
      />
    </div>
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
  opacity: 0;
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
