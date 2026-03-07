<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { Tab } from '../composables/useTabs';
import { useTabDrag } from '../composables/useTabDrag';
import { useI18n } from '../i18n';

const { t } = useI18n();

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

const duplicateFileNames = computed(() => {
  const counts = new Map<string, number>();
  for (const tab of props.tabs) {
    counts.set(tab.fileName, (counts.get(tab.fileName) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name));
});

const getTabDisplayName = (tab: Tab): string => {
  if (!duplicateFileNames.value.has(tab.fileName) || !tab.filePath) {
    return tab.fileName;
  }
  const parts = tab.filePath.replace(/\\/g, '/').split('/');
  const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : null;
  return parentFolder ? `${parentFolder}/${tab.fileName}` : tab.fileName;
};

const hoveredTab = ref<Tab | null>(null);
const tooltipX = ref(0);
const tooltipY = ref(0);
const tooltipRef = ref<HTMLElement | null>(null);

const showTooltip = async (event: MouseEvent, tab: Tab) => {
  if (!tab.filePath) return;
  hoveredTab.value = tab;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tooltipX.value = rect.left + rect.width / 2;
  tooltipY.value = rect.bottom + 8;
  await nextTick();
  if (tooltipRef.value) {
    const tipRect = tooltipRef.value.getBoundingClientRect();
    if (tipRect.left < 8) tooltipX.value += 8 - tipRect.left;
    else if (tipRect.right > window.innerWidth - 8) tooltipX.value -= tipRect.right - (window.innerWidth - 8);
  }
};

const hideTooltip = () => {
  hoveredTab.value = null;
};

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
      @mouseenter="(e) => { handleMouseEnter(index); showTooltip(e, tab); }"
      @mouseleave="() => { handleMouseLeave(); hideTooltip(); }"
    >
      <span class="tab-name">{{ getTabDisplayName(tab) }}</span>
      <span v-if="tab.hasChanges" class="tab-unsaved">*</span>
      <button
        class="tab-close"
        @click.stop="emit('closeTab', tab.id)"
        :title="t.closeTab"
      >&times;</button>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="hoveredTab"
      ref="tooltipRef"
      class="tab-tooltip"
      :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
    >
      <span class="tab-tooltip-name">{{ hoveredTab.fileName }}</span>
      <span class="tab-tooltip-path">{{ hoveredTab.filePath }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.tab-bar {
  display: flex;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
  overflow-x: auto;
  min-height: 36px;
  padding: 0 8px;
}

.tab-bar.drag-active {
  /* Visual feedback that drag is in progress */
}

.tab-bar.drag-target {
  background: var(--success-bg);
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--tab-bg);
  border-radius: 6px 6px 0 0;
  margin-top: 4px;
  cursor: grab;
  user-select: none;
  max-width: 200px;
  transition: background 0.15s, opacity 0.15s;
}

.tab:hover {
  background: var(--tab-hover-bg);
}

.tab.active {
  background: var(--tab-active-bg);
  border: 1px solid var(--border-primary);
  border-bottom: none;
  margin-bottom: -1px;
}

.tab.drop-before {
  border-left: 3px solid var(--success);
  padding-left: 9px;
}

.tab.being-dragged {
  opacity: 0.4;
}

.tab-name {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
  min-width: 0;
}

.tab-unsaved {
  color: var(--text-muted);
  font-weight: 700;
  flex-shrink: 0;
  pointer-events: none;
}

.tab.active .tab-name {
  color: var(--text-primary);
  font-weight: 500;
}

.tab.active .tab-unsaved {
  color: var(--text-primary);
}

.tab-close {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--tab-close-color);
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
  background: var(--danger-light);
  color: white;
}

@media print {
  .tab-bar {
    display: none !important;
  }
}
</style>

<style>
.tab-tooltip {
  position: fixed;
  z-index: 99999;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--bg-secondary, #1e293b);
  border: 1px solid var(--border-primary, #334155);
  border-radius: 6px;
  padding: 6px 10px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  max-width: 480px;
  white-space: nowrap;
  overflow: hidden;
}

.tab-tooltip-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #f1f5f9);
}

.tab-tooltip-path {
  font-size: 11px;
  color: var(--text-muted, #94a3b8);
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
