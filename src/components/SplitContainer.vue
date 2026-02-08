<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useSplitView } from '../composables/useSplitView';
import { useTabDrag } from '../composables/useTabDrag';
import { useWindowManager } from '../composables/useWindowManager';
import { htmlToMarkdown } from '../utils/markdown-converter';
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
  removeTabWithoutCreate,
  isWindowEmpty,
  disableSplit,
  updateTabContent,
  updateTabChanges,
  moveTabBetweenPanes,
  reorderTabWithinPane,
} = useSplitView();

const { setOnDrop, setOnDropOutside } = useTabDrag();
const {
  createNewWindow,
  closeCurrentWindow,
  unregisterOpenFile,
  getAllWindows,
  getCurrentWindowLabel,
  transferTabToWindow,
} = useWindowManager();

const emit = defineEmits<{
  linkClick: [href: string];
  closeTabRequest: [paneId: string, tabId: string];
  changesUpdated: [paneId: string, tabId: string, hasChanges: boolean];
}>();

const leftPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);
const rightPaneRef = ref<InstanceType<typeof EditorPane> | null>(null);
const isDragging = ref(false);
const containerRef = ref<HTMLDivElement | null>(null);

onMounted(() => {
  setOnDrop((tabId, sourcePaneId, targetPaneId, targetIndex) => {
    if (sourcePaneId === targetPaneId) {
      reorderTabWithinPane(targetPaneId, tabId, targetIndex);
    } else {
      moveTabBetweenPanes({
        tabId,
        sourcePaneId,
        targetPaneId,
        targetIndex,
      });
    }
  });

  setOnDropOutside(async (tabId, paneId, filePath) => {
    if (!filePath) {
      console.log('[SplitContainer] Cannot transfer unsaved document');
      return;
    }

    try {
      const pane = splitState.value.panes.find(p => p.id === paneId);
      const tab = pane?.tabs.find(t => t.id === tabId);

      // Save file content before transfer
      if (tab && tab.content) {
        const markdownContent = htmlToMarkdown(tab.content);
        await writeTextFile(filePath, markdownContent);
      }

      // Get current window label and all windows
      const currentWindow = await getCurrentWindowLabel();
      const allWindows = await getAllWindows();

      // Find other windows (excluding current one)
      const otherWindows = allWindows.filter(w => w !== currentWindow);

      console.log('[SplitContainer] Current window:', currentWindow);
      console.log('[SplitContainer] Other windows:', otherWindows);

      // Unregister the file from this window before transfer
      await unregisterOpenFile(filePath);

      if (otherWindows.length > 0) {
        // Transfer to an existing window (prefer 'main' if available, otherwise first other window)
        const targetWindow = otherWindows.includes('main') ? 'main' : otherWindows[0];
        console.log('[SplitContainer] Transferring to existing window:', targetWindow);
        await transferTabToWindow(filePath, currentWindow, targetWindow);
      } else {
        // No other windows exist, create a new one
        console.log('[SplitContainer] Creating new window');
        await createNewWindow(filePath);
      }

      if (tab) {
        tab.hasChanges = false;
      }
      removeTabWithoutCreate(paneId, tabId);

      if (isWindowEmpty()) {
        await closeCurrentWindow();
        return;
      }

      if (isSplitActive.value) {
        const sourcePaneAfter = splitState.value.panes.find(p => p.id === paneId);
        if (sourcePaneAfter && sourcePaneAfter.tabs.length === 0) {
          disableSplit();
        }
      }
    } catch (error) {
      console.error('[SplitContainer] Error transferring tab:', error);
    }
  });
});

const leftPaneStyle = computed(() => ({
  flex: isSplitActive.value ? `0 0 ${splitState.value.splitRatio * 100}%` : '1',
  maxWidth: isSplitActive.value ? `${splitState.value.splitRatio * 100}%` : '100%',
}));

const rightPaneStyle = computed(() => ({
  flex: isSplitActive.value ? `0 0 ${(1 - splitState.value.splitRatio) * 100}%` : '0',
  maxWidth: isSplitActive.value ? `${(1 - splitState.value.splitRatio) * 100}%` : '0',
}));

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

const handleSwitchTab = (paneId: string, tabId: string) => {
  switchTab(paneId, tabId);
};

const handleCloseTab = (paneId: string, tabId: string) => {
  emit('closeTabRequest', paneId, tabId);
};

const handleContentUpdate = (paneId: string, tabId: string, content: string) => {
  updateTabContent(paneId, tabId, content);
};

const handleChangesUpdate = (paneId: string, tabId: string, hasChanges: boolean) => {
  updateTabChanges(paneId, tabId, hasChanges);
  emit('changesUpdated', paneId, tabId, hasChanges);
};

const handleLinkClick = (href: string) => {
  emit('linkClick', href);
};

const handlePaneFocus = (paneId: string) => {
  setActivePane(paneId);
};

const getEditorContent = (paneId: string): string => {
  if (paneId === 'left' && leftPaneRef.value) {
    return leftPaneRef.value.getEditorContent();
  }
  if (paneId === 'right' && rightPaneRef.value) {
    return rightPaneRef.value.getEditorContent();
  }
  return '';
};

const setEditorContent = (paneId: string, content: string) => {
  if (paneId === 'left' && leftPaneRef.value) {
    leftPaneRef.value.setEditorContent(content);
  }
  if (paneId === 'right' && rightPaneRef.value) {
    rightPaneRef.value.setEditorContent(content);
  }
};

const getActiveEditorContent = (): string => {
  return getEditorContent(activePaneId.value);
};

const setActiveEditorContent = (content: string) => {
  setEditorContent(activePaneId.value, content);
};

onUnmounted(() => {
  if (isDragging.value) {
    stopDrag();
  }
});

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
  background: var(--divider-bg);
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.split-divider:hover,
.split-divider.dragging {
  background: var(--divider-hover);
}

.divider-handle {
  width: 2px;
  height: 40px;
  background: var(--divider-handle);
  border-radius: 1px;
  transition: background 0.15s ease;
}

.split-divider:hover .divider-handle,
.split-divider.dragging .divider-handle {
  background: var(--divider-handle-hover);
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
