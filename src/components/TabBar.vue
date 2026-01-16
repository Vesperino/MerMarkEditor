<script setup lang="ts">
import { ref } from 'vue';
import type { Tab } from '../composables/useTabs';

const props = defineProps<{
  tabs: Tab[];
  activeTabId: string;
  paneId?: string;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
  dragStart: [tabId: string, paneId: string];
  dragEnd: [];
  dropTab: [tabId: string, sourcePaneId: string, targetIndex: number];
}>();

const dragOverIndex = ref<number | null>(null);

const handleDragStart = (event: DragEvent, tab: Tab) => {
  if (!event.dataTransfer) return;

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', JSON.stringify({
    tabId: tab.id,
    paneId: props.paneId || 'left',
  }));

  emit('dragStart', tab.id, props.paneId || 'left');
};

const handleDragEnd = () => {
  dragOverIndex.value = null;
  emit('dragEnd');
};

const handleDragOver = (event: DragEvent, index: number) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dragOverIndex.value = index;
};

const handleDragLeave = () => {
  dragOverIndex.value = null;
};

const handleDrop = (event: DragEvent, targetIndex: number) => {
  event.preventDefault();
  dragOverIndex.value = null;

  if (!event.dataTransfer) return;

  try {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    emit('dropTab', data.tabId, data.paneId, targetIndex);
  } catch (e) {
    console.error('Failed to parse drop data:', e);
  }
};

const handleDropOnBar = (event: DragEvent) => {
  event.preventDefault();
  dragOverIndex.value = null;

  if (!event.dataTransfer) return;

  try {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    // Drop at end of tabs
    emit('dropTab', data.tabId, data.paneId, props.tabs.length);
  } catch (e) {
    console.error('Failed to parse drop data:', e);
  }
};
</script>

<template>
  <div
    class="tab-bar"
    @dragover.prevent
    @drop="handleDropOnBar"
  >
    <div
      v-for="(tab, index) in tabs"
      :key="tab.id"
      class="tab"
      :class="{
        active: tab.id === activeTabId,
        'drag-over': dragOverIndex === index
      }"
      draggable="true"
      @click="emit('switchTab', tab.id)"
      @dragstart="handleDragStart($event, tab)"
      @dragend="handleDragEnd"
      @dragover="handleDragOver($event, index)"
      @dragleave="handleDragLeave"
      @drop="handleDrop($event, index)"
    >
      <span class="tab-name">{{ tab.fileName }}{{ tab.hasChanges ? ' *' : '' }}</span>
      <button class="tab-close" @click.stop="emit('closeTab', tab.id)" title="Zamknij">&times;</button>
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

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #e2e8f0;
  border-radius: 6px 6px 0 0;
  margin-top: 4px;
  cursor: pointer;
  user-select: none;
  max-width: 200px;
  transition: background 0.15s;
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

.tab.drag-over {
  border-left: 3px solid #3b82f6;
  padding-left: 9px;
}

.tab[draggable="true"] {
  cursor: grab;
}

.tab[draggable="true"]:active {
  cursor: grabbing;
}

.tab-name {
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
