<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import type { DiffLine, DiffStats } from '../composables/useDiffPreview';

const { t } = useI18n();

defineProps<{
  fileName: string;
  diffLines: DiffLine[];
  diffStats: DiffStats;
}>();

const emit = defineEmits<{
  'keep-local': [];
  'load-external': [];
  close: [];
}>();

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="conflict-overlay" @click.self="emit('close')">
    <div class="conflict-panel">
      <div class="conflict-header">
        <div class="conflict-header-left">
          <svg class="conflict-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <h3>{{ t.fileChangedExternally }}</h3>
            <span class="conflict-filename">{{ fileName }}</span>
          </div>
        </div>
        <button @click="emit('close')" class="conflict-close-btn" :title="t.close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="conflict-message">
        <p>{{ t.fileConflictMessage }}</p>
      </div>

      <div class="conflict-diff-header">
        <span class="conflict-diff-title">{{ t.externalChanges }}</span>
        <div class="conflict-diff-stats">
          <span class="diff-stat-added">+{{ diffStats.additions }}</span>
          <span class="diff-stat-removed">-{{ diffStats.deletions }}</span>
        </div>
      </div>

      <div class="conflict-diff-content">
        <div v-if="diffLines.length === 0" class="conflict-diff-empty">
          {{ t.noChanges }}
        </div>
        <div v-else class="conflict-diff-lines">
          <div
            v-for="(line, index) in diffLines"
            :key="index"
            class="diff-line"
            :class="'diff-line--' + line.type"
          >
            <span class="diff-line-number diff-line-number--old">{{ line.oldLineNumber ?? '' }}</span>
            <span class="diff-line-number diff-line-number--new">{{ line.newLineNumber ?? '' }}</span>
            <span class="diff-line-prefix">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
            <span class="diff-line-content">{{ line.content || ' ' }}</span>
          </div>
        </div>
      </div>

      <div class="conflict-actions">
        <button class="btn-secondary" @click="emit('keep-local')">
          {{ t.keepMyChanges }}
        </button>
        <button class="btn-primary" @click="emit('load-external')">
          {{ t.loadExternalVersion }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
}

.conflict-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 92%;
  max-width: 750px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.conflict-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.conflict-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.conflict-icon {
  color: #f59e0b;
  flex-shrink: 0;
}

.conflict-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.2;
}

.conflict-filename {
  font-size: 13px;
  color: var(--text-muted);
  font-family: "Fira Code", "Consolas", monospace;
}

.conflict-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.conflict-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.conflict-message {
  padding: 14px 20px;
  flex-shrink: 0;
}

.conflict-message p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.conflict-diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  border-top: 1px solid var(--border-primary);
  border-bottom: 1px solid var(--border-primary);
  background: var(--dialog-actions-bg);
  flex-shrink: 0;
}

.conflict-diff-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.conflict-diff-stats {
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  font-family: "Fira Code", "Consolas", monospace;
}

.diff-stat-added {
  color: var(--diff-added-text);
}

.diff-stat-removed {
  color: var(--diff-removed-text);
}

.conflict-diff-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  min-height: 100px;
  max-height: 40vh;
}

.conflict-diff-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: var(--text-muted);
  font-size: 14px;
}

.conflict-diff-lines {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  line-height: 1.5;
}

.diff-line {
  display: flex;
  white-space: pre;
  min-height: 20px;
}

.diff-line--added {
  background: var(--diff-added-bg);
  color: var(--diff-added-text);
}

.diff-line--removed {
  background: var(--diff-removed-bg);
  color: var(--diff-removed-text);
}

.diff-line--unchanged {
  color: var(--text-secondary);
}

.diff-line-number {
  display: inline-block;
  width: 48px;
  text-align: right;
  padding-right: 8px;
  color: var(--text-faint);
  background: var(--diff-gutter-bg);
  border-right: 1px solid var(--diff-gutter-border);
  user-select: none;
  flex-shrink: 0;
}

.diff-line-prefix {
  display: inline-block;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  user-select: none;
  font-weight: 600;
}

.diff-line-content {
  flex: 1;
  padding-right: 16px;
}

.conflict-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-primary);
  background: var(--dialog-actions-bg);
  flex-shrink: 0;
}

.btn-secondary {
  padding: 8px 16px;
  background: var(--border-primary);
  color: var(--text-secondary);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: var(--border-secondary);
  color: var(--text-primary);
}

.btn-primary {
  padding: 8px 16px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: var(--primary-hover);
}
</style>
