<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Pane } from '../types/pane';
import TabBar from './TabBar.vue';
import Editor from './Editor.vue';
import { useTabDrag } from '../composables/useTabDrag';
import { useI18n } from '../i18n';

const { t } = useI18n();

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
function hasWsNodeType(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return Array.from(dt.types as unknown as Iterable<string>).includes(WS_NODE_MIME);
}

const handleFileDragEnter = (e: DragEvent) => {
  if (!hasWsNodeType(e.dataTransfer)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  isFileDragOver.value = true;
};

const handleFileDragOver = (e: DragEvent) => {
  if (!hasWsNodeType(e.dataTransfer)) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  isFileDragOver.value = true;
};

const handleFileDragLeave = (e: DragEvent) => {
  const related = e.relatedTarget as Node | null;
  if (related && (e.currentTarget as Node).contains(related)) return;
  isFileDragOver.value = false;
};

const handleFileDrop = (e: DragEvent) => {
  if (!e.dataTransfer) return;
  const raw = e.dataTransfer.getData(WS_NODE_MIME);
  if (!raw) {
    isFileDragOver.value = false;
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  isFileDragOver.value = false;
  let info: { path: string; kind: 'file' | 'folder' };
  try { info = JSON.parse(raw); } catch { return; }
  if (info.kind !== 'file') return;
  emit('dropFile', info.path);
};

defineExpose({
  editor: computed(() => editorRef.value?.editor),
  getEditorContent: () => editorRef.value?.editor?.getHTML() || '',
  setEditorContent: (_content: string) => { /* handled reactively via modelValue prop */ },
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
