<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useRecentFiles } from '../composables/useRecentFiles';
import { useWorkspace } from '../composables/useWorkspace';
import { t } from '../i18n';

/**
 * Toolbar split-button: click main icon to open a file (default action),
 * click chevron to choose between Open File / Open Workspace / Recent Files / Recent Workspaces.
 *
 * Replaces the original "open-file group" — keeps the file-open default but
 * lifts workspace operations to a single discoverable spot.
 */

const emit = defineEmits<{
  /** User clicked the main icon (or selected "Open file" from dropdown). */
  openFile: [];
  /** User picked a recent file path from the dropdown. */
  openRecent: [filePath: string];
  /** User picked "Open workspace" from the dropdown. */
  openWorkspace: [];
  /** User picked a recent workspace path from the dropdown. */
  openRecentWorkspace: [rootPath: string];
}>();

const { recentFiles, clearRecentFiles } = useRecentFiles();
const ws = useWorkspace();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const toggle = () => {
  isOpen.value = !isOpen.value;
};

const handleOpenFile = () => {
  isOpen.value = false;
  emit('openFile');
};

const handleOpenWorkspace = () => {
  isOpen.value = false;
  emit('openWorkspace');
};

const selectFile = (filePath: string) => {
  isOpen.value = false;
  emit('openRecent', filePath);
};

const selectWorkspace = (root: string) => {
  isOpen.value = false;
  emit('openRecentWorkspace', root);
};

const handleClearRecentFiles = () => {
  clearRecentFiles();
};

const handleClearRecentWorkspaces = () => {
  ws.clearRecents();
};

const handleClickOutside = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
};

onMounted(() => document.addEventListener('mousedown', handleClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside));

function basenameOf(p: string): string {
  if (!p) return '';
  const trimmed = p.replace(/[/\\]+$/, '');
  const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
}

const primaryAction = () => {
  // Click main icon always opens a file — keeps the action predictable.
  // Workspace open is reachable via the chevron dropdown / sidebar.
  emit('openFile');
};
</script>

<template>
  <div class="open-split-button" ref="dropdownRef">
    <button
      class="toolbar-btn primary-btn"
      :title="`${t.open} (Ctrl+O)`"
      @click="primaryAction"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
        <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
      </svg>
    </button>

    <button
      class="toolbar-btn chevron-btn"
      :class="{ active: isOpen }"
      :title="t.openMenuTooltip"
      @click="toggle"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6,9 12,15 18,9"/>
      </svg>
    </button>

    <div v-if="isOpen" class="open-split-dropdown" role="menu">
      <!-- Primary actions -->
      <button class="dropdown-action" @click="handleOpenFile">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7v13a2 2 0 002 2h14a2 2 0 002-2V7"/>
          <path d="M16 3H8a2 2 0 00-2 2v2h12V5a2 2 0 00-2-2z"/>
        </svg>
        <span class="dropdown-action-label">{{ t.openFile }}</span>
        <span class="dropdown-action-shortcut">Ctrl+O</span>
      </button>
      <button class="dropdown-action" @click="handleOpenWorkspace">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        </svg>
        <span class="dropdown-action-label">{{ t.openFolder }}</span>
      </button>

      <!-- Recent files -->
      <template v-if="recentFiles.length > 0">
        <div class="dropdown-divider"></div>
        <div class="dropdown-section-row">
          <span class="dropdown-section">{{ t.recentFiles }}</span>
          <button class="dropdown-clear-btn" @click="handleClearRecentFiles">{{ t.clearRecentFiles }}</button>
        </div>
        <button
          v-for="file in recentFiles"
          :key="file.filePath"
          class="dropdown-recent-item"
          :title="file.filePath"
          @click="selectFile(file.filePath)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <span class="dropdown-recent-name">{{ file.fileName }}</span>
          <span class="dropdown-recent-path">{{ file.filePath }}</span>
        </button>
      </template>

      <!-- Recent workspaces -->
      <template v-if="ws.recentWorkspaces.value.length > 0">
        <div class="dropdown-divider"></div>
        <div class="dropdown-section-row">
          <span class="dropdown-section">{{ t.recentWorkspaces }}</span>
          <button class="dropdown-clear-btn" @click="handleClearRecentWorkspaces">{{ t.workspaceClearRecents }}</button>
        </div>
        <button
          v-for="root in ws.recentWorkspaces.value"
          :key="root"
          class="dropdown-recent-item"
          :title="root"
          @click="selectWorkspace(root)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          <span class="dropdown-recent-name">{{ basenameOf(root) }}</span>
          <span class="dropdown-recent-path">{{ root }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.open-split-button {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.primary-btn {
  /* Inherits toolbar-btn styles from parent. */
}

.chevron-btn {
  padding: 2px 4px !important;
  min-width: auto !important;
  margin-left: -2px;
}

.open-split-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  min-width: 320px;
  max-width: 480px;
  max-height: 480px;
  overflow-y: auto;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: var(--shadow-dropdown);
  margin-top: 4px;
  padding: 4px;
}

.dropdown-action {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 13px;
  border-radius: 4px;
}

.dropdown-action:hover {
  background: var(--hover-bg);
}

.dropdown-action svg {
  color: var(--primary);
  flex-shrink: 0;
}

.dropdown-action-label {
  flex: 1;
}

.dropdown-action-shortcut {
  color: var(--text-faint);
  font-size: 11px;
  font-family: var(--code-font-family, monospace);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}

.dropdown-section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
}

.dropdown-section {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.dropdown-clear-btn {
  background: none;
  border: none;
  color: var(--text-faint);
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}

.dropdown-clear-btn:hover {
  color: var(--primary);
}

.dropdown-recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-size: 12px;
  border-radius: 4px;
}

.dropdown-recent-item:hover {
  background: var(--hover-bg);
}

.dropdown-recent-item svg {
  flex-shrink: 0;
  opacity: 0.6;
}

.dropdown-recent-name {
  flex-shrink: 0;
  font-weight: 500;
}

.dropdown-recent-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-secondary);
  direction: rtl;
  text-align: left;
}
</style>
