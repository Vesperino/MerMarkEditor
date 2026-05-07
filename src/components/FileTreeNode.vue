<script setup lang="ts">
import { ref, computed } from 'vue';
import type { WorkspaceNode } from '../composables/useWorkspace';

defineOptions({ name: 'FileTreeNode' });

const props = defineProps<{
  node: WorkspaceNode;
  depth: number;
  /** When true, this node is the root and its row header is omitted (only children render). */
  isRoot?: boolean;
  /** Path of the folder currently highlighted as a drop target (for visual feedback). */
  dragOverPath?: string | null;
}>();

const emit = defineEmits<{
  (e: 'open-file', path: string): void;
  (e: 'context', payload: { x: number; y: number; node: WorkspaceNode }): void;
  (e: 'node-dragstart', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
  (e: 'node-dragover', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
  (e: 'node-dragleave', payload: { path: string; kind: 'file' | 'folder' }): void;
  (e: 'node-drop', payload: { path: string; kind: 'file' | 'folder'; ev: DragEvent }): void;
}>();

// Folder default: expanded if root, collapsed otherwise.
const expanded = ref<boolean>(props.isRoot === true || props.depth === 0);

const isFolder = computed(() => props.node.kind === 'folder');
const indentPx = computed(() => `${props.depth * 12}px`);
const isDropTarget = computed(() => isFolder.value && props.dragOverPath === props.node.path);

function onRowClick() {
  if (isFolder.value) {
    expanded.value = !expanded.value;
  } else {
    emit('open-file', props.node.path);
  }
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit('context', { x: e.clientX, y: e.clientY, node: props.node });
}

function onDragStart(e: DragEvent) {
  emit('node-dragstart', { path: props.node.path, kind: props.node.kind, ev: e });
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
</script>

<template>
  <div class="file-tree-node">
    <div
      v-if="!isRoot"
      class="tree-row"
      :class="{ folder: isFolder, file: !isFolder, 'drop-target': isDropTarget }"
      :style="{ paddingLeft: indentPx }"
      :draggable="!isRoot"
      @click="onRowClick"
      @contextmenu="onContextMenu"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="tree-chevron" :class="{ expanded, hidden: !isFolder }">
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
      <span class="tree-label" :title="node.path">{{ node.name }}</span>
    </div>

    <div v-if="isFolder && (isRoot || expanded)" class="tree-children">
      <FileTreeNode
        v-for="child in node.children || []"
        :key="child.path"
        :node="child"
        :depth="isRoot ? depth : depth + 1"
        :drag-over-path="dragOverPath"
        @open-file="(p) => emit('open-file', p)"
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

.tree-row.folder .tree-icon {
  color: var(--primary);
}

.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
