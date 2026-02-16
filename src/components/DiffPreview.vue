<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import type { DiffLine, DiffStats } from '../composables/useDiffPreview';

const { t } = useI18n();

defineProps<{
  lines: DiffLine[];
  stats: DiffStats;
}>();

const emit = defineEmits<{
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
  <div class="diff-overlay" @click.self="emit('close')">
    <div class="diff-panel">
      <div class="diff-header">
        <h3>{{ t.changes }}</h3>
        <div class="diff-stats">
          <span class="diff-stat-added">+{{ stats.additions }}</span>
          <span class="diff-stat-removed">-{{ stats.deletions }}</span>
        </div>
        <button @click="emit('close')" class="diff-close-btn" :title="t.closeDiff">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="diff-content">
        <div v-if="lines.length === 0" class="diff-empty">
          {{ t.noChanges }}
        </div>
        <div v-else class="diff-lines">
          <div
            v-for="(line, index) in lines"
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
    </div>
  </div>
</template>

<style scoped>
.diff-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.diff-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 92%;
  max-width: 900px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.diff-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
}

.diff-stats {
  display: flex;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  font-family: "Fira Code", "Consolas", monospace;
}

.diff-stat-added {
  color: var(--diff-added-text);
}

.diff-stat-removed {
  color: var(--diff-removed-text);
}

.diff-close-btn {
  margin-left: auto;
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
}

.diff-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.diff-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
}

.diff-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}

.diff-lines {
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
</style>
