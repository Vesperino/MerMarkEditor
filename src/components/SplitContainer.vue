<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue';
import { useSplitView } from '../composables/useSplitView';
import EditorPane from './EditorPane.vue';

const {
  splitState,
  isSplitActive,
  leftPane,
  rightPane,
  activePaneId,
  setActivePane,
  setSplitRatio,
  switchTab,
  updateTabContent,
  updateTabChanges,
  moveTabBetweenPanes,
  reorderTabWithinPane,
} = useSplitView();

const emit = defineEmits<{
  linkClick: [href: string];
  closeTabRequest: [paneId: string, tabId: string];
}>();

// Refs for pane components
const leftPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);
const rightPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);

// Divider dragging state
const isDragging = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);

// Computed styles for panes
const leftPaneStyle = computed(() => ({
  flex: isSplitActive.value ? `0 0 ${splitState.value.splitRatio * 100}%` : '1',
  maxWidth: isSplitActive.value ? `${splitState.value.splitRatio * 100}%` : '100%',
}));

const rightPaneStyle = computed(() => ({
  flex: isSplitActive.value ? `0 0 ${(1 - splitState.value.splitRatio) * 100}%` : '0',
  maxWidth: isSplitActive.value ? `${(1 - splitState.value.splitRatio) * 100}%` : '0',
}));

// Divider drag handlers
const startDrag = (event: MouseEvent) => {
  event.preventDefault();
  isDragging.value = true;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
};

const onDrag = (event: MouseEvent) => {
  if (!isDragging.value || !containerRef.value) return;

  const containerRect = containerRef.value.getBoundingClientRect();
  const relativeX = event.clientX - containerRect.left;
  const newRatio = relativeX / containerRect.width;

  setSplitRatio(newRatio);
};

const stopDrag = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
};

// Handle tab switching within a pane
const handleSwitchTab = (paneId: string, tabId: string) => {
  switchTab(paneId, tabId);
};

// Handle tab closing - emit event to parent for confirmation
const handleCloseTab = (paneId: string, tabId: string) => {
  emit('closeTabRequest', paneId, tabId);
};

// Handle content updates
const handleContentUpdate = (paneId: string, tabId: string, content: string) => {
  updateTabContent(paneId, tabId, content);
};

// Handle changes updates
const handleChangesUpdate = (paneId: string, tabId: string, hasChanges: boolean) => {
  updateTabChanges(paneId, tabId, hasChanges);
};

// Handle link clicks
const handleLinkClick = (href: string) => {
  emit('linkClick', href);
};

// Handle pane focus
const handlePaneFocus = (paneId: string) => {
  setActivePane(paneId);
};

// Handle tab drop (from drag & drop)
const handleDropTab = (tabId: string, sourcePaneId: string, targetPaneId: string, targetIndex: number) => {
  console.log('[SplitContainer] handleDropTab:', { tabId, sourcePaneId, targetPaneId, targetIndex });

  if (sourcePaneId === targetPaneId) {
    // Reorder within the same pane
    console.log('[SplitContainer] Reordering within pane:', targetPaneId);
    reorderTabWithinPane(targetPaneId, tabId, targetIndex);
  } else {
    // Move between panes
    console.log('[SplitContainer] Moving between panes:', sourcePaneId, '->', targetPaneId);
    moveTabBetweenPanes({
      tabId,
      sourcePaneId,
      targetPaneId,
      targetIndex,
    });
  }
};

// Get editor content for a specific pane
const getEditorContent = (paneId: string): string => {
  if (paneId === 'left' && leftPaneRef.value) {
    return leftPaneRef.value.getEditorContent();
  }
  if (paneId === 'right' && rightPaneRef.value) {
    return rightPaneRef.value.getEditorContent();
  }
  return '';
};

// Set editor content for a specific pane
const setEditorContent = (paneId: string, content: string) => {
  if (paneId === 'left' && leftPaneRef.value) {
    leftPaneRef.value.setEditorContent(content);
  }
  if (paneId === 'right' && rightPaneRef.value) {
    rightPaneRef.value.setEditorContent(content);
  }
};

// Get active pane's editor content
const getActiveEditorContent = (): string => {
  return getEditorContent(activePaneId.value);
};

// Set active pane's editor content
const setActiveEditorContent = (content: string) => {
  setEditorContent(activePaneId.value, content);
};

// Cleanup on unmount
onUnmounted(() => {
  if (isDragging.value) {
    stopDrag();
  }
});

// Expose methods for parent component
defineExpose({
  getEditorContent,
  setEditorContent,
  getActiveEditorContent,
  setActiveEditorContent,
  leftPaneRef,
  rightPaneRef,
});
</script>

<template>
  <div
    ref="containerRef"
    class="split-container"
    :class="{ dragging: isDragging, 'split-active': isSplitActive }"
  >
    <!-- Left Pane (always visible) -->
    <EditorPane
      ref="leftPaneRef"
      :pane="leftPane"
      :is-active="activePaneId === 'left'"
      :style="leftPaneStyle"
      @switch-tab="(tabId) => handleSwitchTab('left', tabId)"
      @close-tab="(tabId) => handleCloseTab('left', tabId)"
      @update-content="(tabId, content) => handleContentUpdate('left', tabId, content)"
      @update-changes="(tabId, hasChanges) => handleChangesUpdate('left', tabId, hasChanges)"
      @link-click="handleLinkClick"
      @focus="handlePaneFocus('left')"
      @drop-tab="handleDropTab"
    />

    <!-- Divider (only visible in split mode) -->
    <div
      v-if="isSplitActive"
      class="split-divider"
      :class="{ dragging: isDragging }"
      @mousedown="startDrag"
    >
      <div class="divider-handle"></div>
    </div>

    <!-- Right Pane (only in split mode) -->
    <EditorPane
      v-if="isSplitActive && rightPane"
      ref="rightPaneRef"
      :pane="rightPane"
      :is-active="activePaneId === 'right'"
      :style="rightPaneStyle"
      @switch-tab="(tabId) => handleSwitchTab('right', tabId)"
      @close-tab="(tabId) => handleCloseTab('right', tabId)"
      @update-content="(tabId, content) => handleContentUpdate('right', tabId, content)"
      @update-changes="(tabId, hasChanges) => handleChangesUpdate('right', tabId, hasChanges)"
      @link-click="handleLinkClick"
      @focus="handlePaneFocus('right')"
      @drop-tab="handleDropTab"
    />
  </div>
</template>

<style scoped>
.split-container {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.split-container.dragging {
  cursor: col-resize;
}

.split-divider {
  width: 6px;
  background: #e2e8f0;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.split-divider:hover,
.split-divider.dragging {
  background: #cbd5e1;
}

.divider-handle {
  width: 2px;
  height: 40px;
  background: #94a3b8;
  border-radius: 1px;
  transition: background 0.15s ease;
}

.split-divider:hover .divider-handle,
.split-divider.dragging .divider-handle {
  background: #64748b;
}

@media print {
  .split-divider {
    display: none !important;
  }

  .split-container {
    display: block;
  }
}
</style>
