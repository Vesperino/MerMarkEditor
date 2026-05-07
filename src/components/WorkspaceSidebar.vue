<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace, type WorkspaceNode } from '../composables/useWorkspace';
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from '../composables/useSettings';
import FileTreeNode from './FileTreeNode.vue';
import WorkspaceContextMenu, { type WorkspaceContextAction } from './WorkspaceContextMenu.vue';

const { t } = useI18n();
const ws = useWorkspace();

const emit = defineEmits<{
  (e: 'open-file', path: string): void;
}>();

const showMenu = ref(false);

// Context menu state
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

async function onContextAction(action: WorkspaceContextAction) {
  const node = ctxNode.value;
  if (!node) return;

  if (action === 'reveal') {
    try { await ws.revealInOs(node.path); } catch (e) { console.error('reveal:', e); }
    return;
  }

  if (action === 'new-file') {
    if (node.kind !== 'folder') return;
    const name = window.prompt(t.value.workspaceNewFilePrompt, 'untitled.md');
    if (!name) return;
    try {
      const created = await ws.createFile(node.path, name);
      emit('open-file', created);
    } catch (e) {
      console.error('createFile:', e);
      window.alert(String(e));
    }
    return;
  }

  if (action === 'rename') {
    const newName = window.prompt(t.value.workspaceRenamePrompt, node.name);
    if (!newName || newName === node.name) return;
    const sepIdx = Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'));
    const sep = node.path.includes('\\') && (sepIdx === -1 || node.path[sepIdx] === '\\') ? '\\' : '/';
    const parent = sepIdx >= 0 ? node.path.slice(0, sepIdx) : '';
    const dest = parent ? `${parent}${sep}${newName}` : newName;
    try {
      await ws.renamePath(node.path, dest);
    } catch (e) {
      console.error('rename:', e);
      window.alert(String(e));
    }
    return;
  }

  if (action === 'delete') {
    const ok = window.confirm(t.value.workspaceConfirmDelete(node.name));
    if (!ok) return;
    try {
      await ws.deletePath(node.path);
    } catch (e) {
      console.error('delete:', e);
      window.alert(String(e));
    }
  }
}

async function pickFolder() {
  showMenu.value = false;
  try { await ws.openWorkspaceDialog(); } catch (e) { console.error('open:', e); }
}

function openRecent(path: string) {
  showMenu.value = false;
  ws.openWorkspace(path).catch((e) => console.error('open recent:', e));
}

async function refresh() {
  showMenu.value = false;
  try { await ws.refreshTree(); } catch (e) { console.error('refresh:', e); }
}

function close() {
  showMenu.value = false;
  ws.closeWorkspace();
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
const headerName = computed(() => ws.activeWorkspace.value?.name ?? '');
</script>

<template>
  <aside
    class="workspace-sidebar"
    :class="{ resizing }"
    :style="{ width: widthPx }"
  >
    <header class="ws-header">
      <span class="ws-title" :title="ws.activeWorkspace.value?.rootPath ?? ''">
        {{ ws.activeWorkspace.value ? headerName : t.workspace }}
      </span>
      <button
        class="ws-menu-btn"
        :aria-label="t.workspace"
        @click="showMenu = !showMenu"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="5" r="1.5"/>
          <circle cx="12" cy="12" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
        </svg>
      </button>

      <div v-if="showMenu" class="ws-menu" @click.self="showMenu = false">
        <button class="ws-menu-item" @click="pickFolder">{{ t.openFolder }}</button>
        <button v-if="ws.activeWorkspace.value" class="ws-menu-item" @click="refresh">{{ t.refreshTree }}</button>
        <button v-if="ws.activeWorkspace.value" class="ws-menu-item" @click="close">{{ t.closeWorkspace }}</button>
        <template v-if="ws.recentWorkspaces.value.length">
          <div class="ws-menu-divider"></div>
          <div class="ws-menu-section">{{ t.recentWorkspaces }}</div>
          <button
            v-for="r in ws.recentWorkspaces.value"
            :key="r"
            class="ws-menu-item recent"
            :title="r"
            @click="openRecent(r)"
          >
            {{ r.split(/[\/\\]/).filter(Boolean).slice(-1)[0] || r }}
          </button>
        </template>
      </div>
    </header>

    <div class="ws-body">
      <div v-if="ws.isLoading.value" class="ws-state">…</div>
      <div v-else-if="ws.error.value" class="ws-state error">{{ t.workspaceErrorLoad }}</div>
      <div v-else-if="!ws.activeWorkspace.value" class="ws-empty">
        <p>{{ t.workspaceEmptyHint }}</p>
        <button class="ws-empty-btn" @click="pickFolder">{{ t.openFolder }}</button>
      </div>
      <div v-else-if="ws.tree.value" class="ws-tree">
        <FileTreeNode
          :node="ws.tree.value"
          :depth="0"
          :is-root="true"
          @open-file="(p) => emit('open-file', p)"
          @context="openContext"
        />
      </div>
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

.ws-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.ws-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-menu-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
}

.ws-menu-btn:hover {
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

.ws-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0 8px;
}

.ws-tree {
  padding: 4px 0;
}

.ws-state {
  padding: 16px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

.ws-state.error {
  color: var(--danger);
}

.ws-empty {
  padding: 16px;
  font-size: 13px;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.ws-empty-btn {
  padding: 6px 12px;
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
