<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Pane } from '../types/pane';
import TabBar from './TabBar.vue';
import Editor from './Editor.vue';
import { useTabDrag } from '../composables/useTabDrag';
import { useWorkspace } from '../composables/useWorkspace';
import { useI18n } from '../i18n';

const { t } = useI18n();
const ws = useWorkspace();

const props = defineProps<{
  pane: Pane;
  isActive: boolean;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
  togglePin: [tabId: string];
  closeOthers: [tabId: string];
  closeAll: [];
  closeAllButPinned: [];
  closeSaved: [];
  updateContent: [tabId: string, content: string];
  updateChanges: [tabId: string, hasChanges: boolean];
  linkClick: [href: string];
  focus: [];
  dropFile: [filePath: string];
  openDroppedFiles: [files: File[]];
}>();

const WS_NODE_MIME = 'application/x-mermark-ws-node';

const isFileDragOver = ref(false);

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const { isDragging, draggedTab, setDropZone, clearDropZone } = useTabDrag();

const isEmpty = computed(() => props.pane.tabs.length === 0);

const activeTab = computed(() => {
  return props.pane.tabs.find(t => t.id === props.pane.activeTabId);
});

const editorContent = computed(() => activeTab.value?.content || '<p></p>');
const editorFilePath = computed(() => activeTab.value?.filePath || null);

const isValidDropTarget = computed(() => {
  return isDragging.value && draggedTab.value?.paneId !== props.pane.id;
});

const handleContentUpdate = (content: string) => {
  if (activeTab.value) {
    emit('updateContent', activeTab.value.id, content);
  }
};

const handleChangesUpdate = (hasChanges: boolean) => {
  if (activeTab.value) {
    emit('updateChanges', activeTab.value.id, hasChanges);
  }
};

const handleLinkClick = (href: string) => {
  emit('linkClick', href);
};

const handleSwitchTab = (tabId: string) => {
  emit('switchTab', tabId);
};

const handleCloseTab = (tabId: string) => {
  emit('closeTab', tabId);
};

const handlePaneFocus = () => {
  emit('focus');
};

const handlePaneMouseEnter = () => {
  if (isDragging.value && isValidDropTarget.value) {
    setDropZone(props.pane.id, props.pane.tabs.length);
  }
};

const handlePaneMouseLeave = () => {
  if (isDragging.value) {
    clearDropZone();
  }
};

// Capture phase + dragenter — TipTap installs its own dragover handler that
// preventDefaults text/html drags but ignores our custom mime; without
// capture the cursor stays in not-allowed state.
//
// Primary signal is `ws.isDraggingNode` (set in onTreeDragStart). MIME-type
// sniffing via `dataTransfer.types` is unreliable across the
// TipTap/iframe/webview event path — Chromium sometimes hides the custom
// mime during dragenter, leaving us with a "no-drop" cursor even though
// the drag is legit. Trusting the module-level flag avoids that.
function isWorkspaceDrag(dt: DataTransfer | null): boolean {
  if (ws.isDraggingNode.value) return true;
  if (!dt) return false;
  return Array.from(dt.types as unknown as Iterable<string>).includes(WS_NODE_MIME);
}

// True for OS file drags (Explorer/Finder/other apps). These carry a "Files"
// entry in dataTransfer.types. The actual file handling happens in the editor
// (ProseMirror handleDrop) — here we only need to let the drop through by
// preventing the default "no-drop" behavior on the pane chrome.
function isOsFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types as unknown as Iterable<string>).includes('Files');
}

const handleFileDragEnter = (e: DragEvent) => {
  const osFile = isOsFileDrag(e.dataTransfer);
  if (!isWorkspaceDrag(e.dataTransfer) && !osFile) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  // Only paint the pane-wide overlay for workspace drags; OS file drops are
  // handled inline by the editor at the cursor, no full-pane highlight.
  if (!osFile) isFileDragOver.value = true;
};

const handleFileDragOver = (e: DragEvent) => {
  const osFile = isOsFileDrag(e.dataTransfer);
  if (!isWorkspaceDrag(e.dataTransfer) && !osFile) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  // For OS file drags, don't stopPropagation — the event must reach the
  // editor (ProseMirror handleDrop) which does the actual import/insert.
  if (osFile) return;
  e.stopPropagation();
  isFileDragOver.value = true;
};

const handleFileDragLeave = (e: DragEvent) => {
  const related = e.relatedTarget as Node | null;
  if (related && (e.currentTarget as Node).contains(related)) return;
  isFileDragOver.value = false;
};

const handleFileDrop = (e: DragEvent) => {
  if (!isWorkspaceDrag(e.dataTransfer)) {
    isFileDragOver.value = false;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  isFileDragOver.value = false;

  // Prefer the MIME payload (carries kind=file|folder) but fall back to the
  // shared draggedPaths snapshot when getData returns empty (Chromium quirk
  // during cross-pane drops).
  let paths: string[] = [];
  let kind: 'file' | 'folder' = 'file';
  const raw = e.dataTransfer?.getData(WS_NODE_MIME);
  if (raw) {
    try {
      const info = JSON.parse(raw) as { paths?: string[]; primary?: string; kind?: 'file' | 'folder' };
      paths = info.paths ?? (info.primary ? [info.primary] : []);
      kind = info.kind ?? 'file';
    } catch {
      paths = ws.draggedPaths.value;
    }
  } else {
    paths = ws.draggedPaths.value;
  }
  if (kind !== 'file') return;
  for (const p of paths) emit('dropFile', p);
};

defineExpose({
  editor: computed(() => editorRef.value?.editor),
  paneId: computed(() => props.pane.id),
  getFilePath: () => activeTab.value?.filePath ?? null,
  insertImagesByPath: (items: { path: string; alt: string }[]) =>
    editorRef.value?.insertImagesByPath?.(items),
  getEditorContent: () => editorRef.value?.editor?.getHTML() || '',
  setEditorContent: (_content: string) => { /* handled reactively via modelValue prop */ },
  getSearchTextMap: () => editorRef.value?.getSearchTextMap?.() ?? null,
  setSearchHighlights: (...args: Parameters<NonNullable<InstanceType<typeof Editor>['setSearchHighlights']>>) =>
    editorRef.value?.setSearchHighlights?.(...args),
  clearSearchHighlights: () => editorRef.value?.clearSearchHighlights?.(),
  focusSearchMatch: (...args: Parameters<NonNullable<InstanceType<typeof Editor>['focusSearchMatch']>>) =>
    editorRef.value?.focusSearchMatch?.(...args),
});
</script>

<template>
  <div
    class="editor-pane"
    :class="{
      active: isActive,
      'drop-target': isValidDropTarget || isFileDragOver,
      empty: isEmpty
    }"
    @mousedown="handlePaneFocus"
    @focusin="handlePaneFocus"
    @mouseenter="handlePaneMouseEnter"
    @mouseleave="handlePaneMouseLeave"
    @dragenter.capture="handleFileDragEnter"
    @dragover.capture="handleFileDragOver"
    @dragleave="handleFileDragLeave"
    @drop.capture="handleFileDrop"
  >
    <!-- Tab bar (only show if has tabs) -->
    <TabBar
      v-if="!isEmpty"
      :tabs="pane.tabs"
      :active-tab-id="pane.activeTabId"
      :pane-id="pane.id"
      @switch-tab="handleSwitchTab"
      @close-tab="handleCloseTab"
      @toggle-pin="(id) => emit('togglePin', id)"
      @close-others="(id) => emit('closeOthers', id)"
      @close-all="emit('closeAll')"
      @close-all-but-pinned="emit('closeAllButPinned')"
      @close-saved="emit('closeSaved')"
    />

    <!-- Editor content or empty state -->
    <div class="editor-wrapper">
      <Editor
        v-if="!isEmpty"
        ref="editorRef"
        :model-value="editorContent"
        :file-path="editorFilePath"
        @update:model-value="handleContentUpdate"
        @update:has-changes="handleChangesUpdate"
        @link-click="handleLinkClick"
        @open-dropped-files="(files) => emit('openDroppedFiles', files)"
      />

      <!-- Empty state - shown when no tabs -->
      <div v-else class="empty-pane">
        <div class="empty-icon">📄</div>
        <div class="empty-title">{{ t.dragTabHere }}</div>
        <div class="empty-subtitle">{{ t.orOpenFileInPane }}</div>
      </div>

      <div
        v-if="(isValidDropTarget || isFileDragOver) && !isEmpty"
        class="drop-overlay"
      >
        <div class="drop-message">{{ isFileDragOver ? t.orOpenFileInPane : t.dropTabHere }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--editor-container-bg);
  border: 2px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.editor-pane.drop-target {
  border-color: var(--success);
  background: var(--success-bg);
}

.editor-pane.empty {
  background: var(--bg-tertiary);
}

.editor-pane.empty.drop-target {
  background: var(--success-hover-bg);
  border-color: var(--success);
}

.editor-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.empty-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  user-select: none;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
}

.empty-subtitle {
  font-size: 14px;
  color: var(--text-faint);
}

.drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--drop-overlay-bg);
  border: 3px dashed var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.drop-message {
  font-size: 18px;
  font-weight: 600;
  color: var(--drop-message-color);
  background: var(--drop-message-bg);
  padding: 12px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px var(--shadow-sm);
}

@media print {
  .editor-pane {
    border: none !important;
  }
}
</style>
