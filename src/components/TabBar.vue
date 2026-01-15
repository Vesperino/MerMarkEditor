<script setup lang="ts">
import type { Tab } from '../composables/useTabs';

defineProps<{
  tabs: Tab[];
  activeTabId: string;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
}>();
</script>

<template>
  <div class="tab-bar">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === activeTabId }"
      @click="emit('switchTab', tab.id)"
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
