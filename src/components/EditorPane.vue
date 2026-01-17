<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { Pane } from '../types/pane';
import TabBar from './TabBar.vue';
import Editor from './Editor.vue';
import { useTabDrag } from '../composables/useTabDrag';

const props = defineProps<{
  pane: Pane;
  isActive: boolean;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
  updateContent: [tabId: string, content: string];
  updateChanges: [tabId: string, hasChanges: boolean];
  linkClick: [href: string];
  focus: [];
}>();

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const { isDragging, draggedTab, setDropZone, clearDropZone } = useTabDrag();

const isEmpty = computed(() => props.pane.tabs.length === 0);

const activeTab = computed(() => {
  return props.pane.tabs.find(t => t.id === props.pane.activeTabId);
});

const editorContent = computed(() => activeTab.value?.content || '<p></p>');

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

watch(() => props.pane.activeTabId, async () => {
  await nextTick();
  if (editorRef.value?.editor && activeTab.value) {
    const currentContent = editorRef.value.editor.getHTML();
    if (currentContent !== activeTab.value.content) {
      editorRef.value.editor.commands.setContent(activeTab.value.content);
    }
  }
});

defineExpose({
  editor: computed(() => editorRef.value?.editor),
  getEditorContent: () => editorRef.value?.editor?.getHTML() || '',
  setEditorContent: (content: string) => {
    editorRef.value?.editor?.commands.setContent(content);
  },
});
</script>

<template>
  <div
    class="editor-pane"
    :class="{
      active: isActive,
      'drop-target': isValidDropTarget,
      empty: isEmpty
    }"
    @mousedown="handlePaneFocus"
    @focusin="handlePaneFocus"
    @mouseenter="handlePaneMouseEnter"
    @mouseleave="handlePaneMouseLeave"
  >
    <!-- Tab bar (only show if has tabs) -->
    <TabBar
      v-if="!isEmpty"
      :tabs="pane.tabs"
      :active-tab-id="pane.activeTabId"
      :pane-id="pane.id"
      @switch-tab="handleSwitchTab"
      @close-tab="handleCloseTab"
    />

    <!-- Editor content or empty state -->
    <div class="editor-wrapper">
      <Editor
        v-if="!isEmpty"
        ref="editorRef"
        :model-value="editorContent"
        @update:model-value="handleContentUpdate"
        @update:has-changes="handleChangesUpdate"
        @link-click="handleLinkClick"
      />

      <!-- Empty state - shown when no tabs -->
      <div v-else class="empty-pane">
        <div class="empty-icon">📄</div>
        <div class="empty-title">Przeciągnij kartę tutaj</div>
        <div class="empty-subtitle">lub otwórz plik w tym panelu</div>
      </div>

      <!-- Drop overlay during drag -->
      <div
        v-if="isValidDropTarget && !isEmpty"
        class="drop-overlay"
      >
        <div class="drop-message">Upuść kartę tutaj</div>
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
  background: #f8fafc;
  border: 2px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.editor-pane.active {
  border-color: #3b82f6;
}

.editor-pane:not(.active) {
  opacity: 0.95;
}

.editor-pane.drop-target {
  border-color: #10b981;
  background: #ecfdf5;
}

.editor-pane.empty {
  background: #f1f5f9;
}

.editor-pane.empty.drop-target {
  background: #d1fae5;
  border-color: #10b981;
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
  color: #64748b;
  user-select: none;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #475569;
}

.empty-subtitle {
  font-size: 14px;
  color: #94a3b8;
}

.drop-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(16, 185, 129, 0.15);
  border: 3px dashed #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.drop-message {
  font-size: 18px;
  font-weight: 600;
  color: #059669;
  background: white;
  padding: 12px 24px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

@media print {
  .editor-pane {
    border: none !important;
  }
}
</style>
