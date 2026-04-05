<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRecentFiles } from '../composables/useRecentFiles';
import { t } from '../i18n';

const emit = defineEmits<{
  openRecent: [filePath: string];
}>();

const { recentFiles, clearRecentFiles } = useRecentFiles();
const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const selectFile = (filePath: string) => {
  isOpen.value = false;
  emit('openRecent', filePath);
};

const handleClear = () => {
  clearRecentFiles();
  isOpen.value = false;
};

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener('mousedown', handleClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside));
</script>

<template>
  <div class="recent-files-wrapper" ref="dropdownRef">
    <button
      class="toolbar-btn recent-files-toggle"
      :class="{ active: isOpen }"
      :title="t.recentFiles"
      @click="toggle"
      :disabled="recentFiles.length === 0"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6,9 12,15 18,9"/>
      </svg>
    </button>

    <div v-if="isOpen" class="recent-files-dropdown">
      <div class="recent-files-header">{{ t.recentFiles }}</div>
      <button
        v-for="file in recentFiles"
        :key="file.filePath"
        class="recent-file-item"
        :title="file.filePath"
        @click="selectFile(file.filePath)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
        </svg>
        <span class="recent-file-name">{{ file.fileName }}</span>
        <span class="recent-file-path">{{ file.filePath }}</span>
      </button>
      <div class="recent-files-footer">
        <button class="recent-files-clear" @click="handleClear">
          {{ t.clearRecentFiles }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recent-files-wrapper {
  position: relative;
  display: inline-flex;
}

.recent-files-toggle {
  padding: 2px 4px !important;
  min-width: auto !important;
  margin-left: -4px;
}

.recent-files-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  min-width: 320px;
  max-width: 480px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  margin-top: 4px;
}

.recent-files-header {
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.recent-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 13px;
}

.recent-file-item:hover {
  background: var(--bg-hover);
}

.recent-file-item svg {
  flex-shrink: 0;
  opacity: 0.5;
}

.recent-file-name {
  flex-shrink: 0;
  font-weight: 500;
}

.recent-file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-secondary);
  direction: rtl;
  text-align: left;
}

.recent-files-footer {
  border-top: 1px solid var(--border-color);
  padding: 4px;
}

.recent-files-clear {
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  border-radius: 4px;
}

.recent-files-clear:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
