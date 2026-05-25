<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { WorkspaceNode } from '../composables/useWorkspace';
import { useWorkspace } from '../composables/useWorkspace';
import { useI18n } from '../i18n';

defineOptions({ name: 'FileTreeNode' });

const { t } = useI18n();
const wsViewChangesLabel = computed(() => t.value.workspaceViewChanges);
const wsSortFolderLabel = computed(() => t.value.workspaceSortFolder);

const props = defineProps<{
  node: WorkspaceNode;
  depth: number;
  /** When true, this node is the workspace root and renders only its children. */
  isRoot?: boolean;
  /** Path of the folder currently highlighted as a drop target (for visual feedback). */
  dragOverPath?: string | null;
  /** Id of the owning workspace — used to resolve per-workspace/folder sort. */
  workspaceId: string;
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
}>();

const ws = useWorkspace();

const isFolder = computed(() => props.node.kind === 'folder');
const indentPx = computed(() => `${props.depth * 12}px`);

/**
 * Folder is expanded when it's the workspace root (always renders its
 * children) or when its path is tracked in the shared expanded-folders set.
 * Top-level folders get added to that set automatically on first tree load,
 * which gives the "expanded by default" feel while still letting the user
 * collapse them.
 */
const expanded = computed(
  () => props.isRoot === true || ws.isFolderExpanded(props.node.path),
);

const isDropTarget = computed(
  () => isFolder.value && props.dragOverPath === props.node.path,
);

const isHighlighted = computed(
  () => !isFolder.value && ws.highlightedPath.value === props.node.path,
);

const isSelectedRow = computed(() => ws.isSelected(props.node.path));
const isDirtyRow = computed(() => !isFolder.value && ws.isDirty(props.node.path));

const rowEl = ref<HTMLDivElement | null>(null);

function onViewChanges(e: MouseEvent) {
  e.stopPropagation();
  emit('view-changes', props.node.path);
}

/**
 * Single click = select (with Ctrl=toggle, Shift=range). Folders toggle on the
 * chevron only — clicking the row never opens or expands. Use double-click to
 * open files / expand folders, drag to insert/open in editor.
 */
function onRowClick(e: MouseEvent) {
  const path = props.node.path;
  if (e.shiftKey) {
    ws.rangeSelect(path);
  } else if (e.ctrlKey || e.metaKey) {
    ws.toggleSelect(path);
  } else {
    ws.selectOnly(path);
  }
}

function onRowDblClick() {
  if (isFolder.value) {
    ws.toggleFolder(props.node.path);
  } else {
    emit('open-file', props.node.path);
  }
}

function onChevronClick(e: MouseEvent) {
  e.stopPropagation();
  if (isFolder.value) ws.toggleFolder(props.node.path);
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  // Right-click on an unselected row replaces the selection — matches Explorer/VS.
  if (!ws.isSelected(props.node.path)) ws.selectOnly(props.node.path);
  emit('context', { x: e.clientX, y: e.clientY, node: props.node });
}

function onSortFolder(e: MouseEvent) {
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit('sort-folder', { path: props.node.path, x: r.left, y: r.bottom + 4 });
}

function onDragStart(e: DragEvent) {
  emit('node-dragstart', { path: props.node.path, kind: props.node.kind, ev: e });
}
function onDragEnd() {
  ws.endNodeDrag();
}
function onDragOver(e: DragEvent) {
  emit('node-dragover', { path: props.node.path, kind: props.node.kind, ev: e });
}
function onDragLeave() {
  emit('node-dragleave', { path: props.node.path, kind: props.node.kind });
}
function onDrop(e: DragEvent) {
  emit('node-drop', { path: props.node.path, kind: props.node.kind, ev: e });
}

/**
 * Auto-scroll the highlighted row into view when it becomes active, so
 * opening a file (click, dbl-click, workspace drag, recent, or switching
 * tabs) reveals it even if the user had scrolled away.
 *
 * Two timing guards matter:
 *  - inView is measured against the sidebar's own scroll container
 *    (`.ws-body`), not the window — a row scrolled out of the sidebar can
 *    still be inside the viewport.
 *  - the scroll runs after nextTick + a rAF, because highlighting a file in
 *    a collapsed folder first expands ancestors; the row only gets its
 *    final layout position once that re-render has flushed.
 */
function scrollIntoViewIfNeeded() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const el = rowEl.value;
      if (!el || !isHighlighted.value) return;
      const scroller = el.closest('.ws-body') as HTMLElement | null;
      const scrollerRect = scroller
        ? scroller.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const rect = el.getBoundingClientRect();
      const inView = rect.top >= scrollerRect.top && rect.bottom <= scrollerRect.bottom;
      if (!inView) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  });
}

onMounted(() => {
  if (isHighlighted.value) scrollIntoViewIfNeeded();
});

watch(
  () => isHighlighted.value,
  (now) => {
    if (now) scrollIntoViewIfNeeded();
  },
);
</script>

<template>
  <div class="file-tree-node">
    <div
      v-if="!isRoot"
      ref="rowEl"
      class="tree-row"
      :class="{
        folder: isFolder,
        file: !isFolder,
        'drop-target': isDropTarget,
        active: isHighlighted,
        selected: isSelectedRow,
      }"
      :style="{ paddingLeft: indentPx }"
      draggable="true"
      @click="onRowClick"
      @dblclick="onRowDblClick"
      @contextmenu.prevent.stop="onContextMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="tree-chevron" :class="{ expanded, hidden: !isFolder }" @click="onChevronClick">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
      <span class="tree-icon">
        <svg v-if="isFolder" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </span>
      <span class="tree-label" v-tooltip="node.path">{{ node.name }}</span>
      <!-- Sort button: visible on hover for folders; opens the per-folder sort menu. -->
      <button
        v-if="isFolder"
        class="tree-sort-btn"
        v-tooltip="wsSortFolderLabel"
        @click="onSortFolder"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="4" y1="6" x2="13" y2="6"/>
          <line x1="4" y1="12" x2="11" y2="12"/>
          <line x1="4" y1="18" x2="9" y2="18"/>
          <polyline points="17 8 20 5 20 5"/>
          <path d="M20 5v14l-3-3"/>
        </svg>
      </button>
      <!-- Changes button: visible on hover for unsaved files; opens the diff. -->
      <button
        v-if="isDirtyRow"
        class="tree-changes-btn"
        v-tooltip=" wsViewChangesLabel"
        @click="onViewChanges"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      <!-- Dirty star: clearly flags an edited/unsaved file (hidden on row
           hover, where the changes button takes its place). -->
      <span v-if="isDirtyRow" class="tree-dirty-star" v-tooltip="wsViewChangesLabel" aria-hidden="true">*</span>
    </div>

    <div v-if="isFolder && expanded" class="tree-children">
      <FileTreeNode
        v-for="child in ws.sortChildren(node.children || [], node.path, workspaceId)"
        :key="child.path"
        :node="child"
        :depth="isRoot ? depth : depth + 1"
        :drag-over-path="dragOverPath"
        :workspace-id="workspaceId"
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
  </div>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px 3px 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  border-radius: 3px;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}

.tree-row:hover {
  background: var(--hover-bg);
}

.tree-row.active {
  background: var(--active-bg);
  color: var(--active-text);
  font-weight: 500;
}

.tree-row.drop-target {
  background: var(--active-bg);
  outline: 1px dashed var(--primary);
  outline-offset: -1px;
}

.tree-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  color: var(--text-faint);
  transition: transform 0.1s ease;
}

.tree-chevron.expanded {
  transform: rotate(90deg);
}

.tree-chevron.hidden {
  visibility: hidden;
}

.tree-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  flex-shrink: 0;
}

.tree-row svg,
.tree-row .tree-icon {
  pointer-events: none;
}

.tree-row .tree-chevron {
  cursor: pointer;
}

.tree-row.selected {
  background: var(--active-bg);
  outline: 1px solid var(--primary);
  outline-offset: -1px;
}

.tree-row.folder .tree-icon {
  color: var(--primary);
}

.tree-row.active .tree-icon {
  color: var(--active-text);
}

.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Unsaved marker — bold accent star, hidden while the changes button shows. */
.tree-dirty-star {
  flex-shrink: 0;
  margin-right: 2px;
  color: var(--primary);
  font-weight: 700;
  font-size: 16px;
  line-height: 1;
  transform: translateY(2px);
}

.tree-row:hover .tree-dirty-star {
  display: none;
}

/* Changes button — only visible on row hover (and only rendered for dirty files). */
.tree-changes-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.tree-row:hover .tree-changes-btn {
  display: flex;
}

.tree-changes-btn:hover {
  background: var(--hover-bg);
  color: var(--primary);
}

/* Per-folder sort button — appears on folder-row hover. */
.tree-sort-btn {
  display: none;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.tree-row:hover .tree-sort-btn {
  display: flex;
}

.tree-sort-btn:hover {
  background: var(--hover-bg);
  color: var(--primary);
}
</style>
