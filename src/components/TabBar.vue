<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Tab } from '../composables/useTabs';
import { useTabDrag } from '../composables/useTabDrag';

const props = defineProps<{
  tabs: Tab[];
  activeTabId: string;
  paneId?: string;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
}>();

const { isDragging, draggedTab, startDrag, setDropZone, clearDropZone } = useTabDrag();

const dropTargetIndex = ref<number | null>(null);

// Check if we're dragging over this pane
const isDraggingOverThisPane = computed(() => {
  return isDragging.value && draggedTab.value?.paneId !== props.paneId;
});

const handleMouseDown = (event: MouseEvent, tab: Tab) => {
  // Only left click
  if (event.button !== 0) return;

  // Don't start drag if clicking close button
  const target = event.target as HTMLElement;
  if (target.closest('.tab-close')) return;

  // Prevent text selection
  event.preventDefault();

  // Store initial position to detect drag threshold
  const startX = event.clientX;
  const startY = event.clientY;
  const DRAG_THRESHOLD = 5;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    const dx = Math.abs(moveEvent.clientX - startX);
    const dy = Math.abs(moveEvent.clientY - startY);

    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      // Start actual drag
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      startDrag({
        tabId: tab.id,
        paneId: props.paneId || 'left',
        fileName: tab.fileName,
        filePath: tab.filePath,
        element: event.currentTarget as HTMLElement,
      }, moveEvent);
    }
  };

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    // Just a click, not a drag - switch tab
    emit('switchTab', tab.id);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

const handleMouseEnter = (index: number) => {
  if (isDragging.value) {
    dropTargetIndex.value = index;
    setDropZone(props.paneId || 'left', index);
  }
};

const handleMouseLeave = () => {
  if (isDragging.value) {
    dropTargetIndex.value = null;
    // Don't clear drop zone here - we might still be over the tab bar
    // The drop zone will be updated by handleBarMouseEnter or cleared by handleBarMouseLeave
  }
};

const handleBarMouseEnter = () => {
  if (isDragging.value) {
    // Drop at end when hovering over empty bar area
    setDropZone(props.paneId || 'left', props.tabs.length);
  }
};

const handleBarMouseMove = (event: MouseEvent) => {
  if (isDragging.value && dropTargetIndex.value === null) {
    // Mouse moved from a tab to empty bar space - set drop zone to end
    const target = event.target as HTMLElement;
    if (target.classList.contains('tab-bar')) {
      setDropZone(props.paneId || 'left', props.tabs.length);
    }
  }
};

const handleBarMouseLeave = () => {
  if (isDragging.value) {
    dropTargetIndex.value = null;
    clearDropZone();
  }
};
</script>

<template>
  <div
    class="tab-bar"
    :class="{ 'drag-active': isDragging, 'drag-target': isDraggingOverThisPane }"
    @mouseenter="handleBarMouseEnter"
    @mousemove="handleBarMouseMove"
    @mouseleave="handleBarMouseLeave"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab"
      :class="{
        active: tab.id === activeTabId,
        'drop-before': dropTargetIndex === index && isDragging,
        'being-dragged': isDragging && draggedTab?.tabId === tab.id
      }"
      @mousedown="handleMouseDown($event, tab)"
      @mouseenter="handleMouseEnter(index)"
      @mouseleave="handleMouseLeave"
    >
      <span class="tab-name">{{ tab.fileName }}{{ tab.hasChanges ? ' *' : '' }}</span>
      <button
        class="tab-close"
        @click.stop="emit('closeTab', tab.id)"
        title="Zamknij"
      >&times;</button>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  min-height: 36px;
  padding: 0 8px;
}

.tab-bar.drag-active {
  /* Visual feedback that drag is in progress */
}

.tab-bar.drag-target {
  background: #ecfdf5;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #e2e8f0;
  border-radius: 6px 6px 0 0;
  margin-top: 4px;
  cursor: grab;
  user-select: none;
  max-width: 200px;
  transition: background 0.15s, opacity 0.15s;
}

.tab:hover {
  background: #cbd5e1;
}

.tab.active {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  margin-bottom: -1px;
}

.tab.drop-before {
  border-left: 3px solid #10b981;
  padding-left: 9px;
}

.tab.being-dragged {
  opacity: 0.4;
}

.tab-name {
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.tab.active .tab-name {
  color: #1e293b;
  font-weight: 500;
}

.tab-close {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
  padding: 0;
}

.tab-close:hover {
  background: #ef4444;
  color: white;
}

@media print {
  .tab-bar {
    display: none !important;
  }
}
</style>
