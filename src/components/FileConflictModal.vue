<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import { splitIntoHunks, applyHunkSelections } from '../composables/useDiffPreview';
import type { DiffLine, DiffStats } from '../composables/useDiffPreview';

const { t } = useI18n();

const props = defineProps<{
  fileName: string;
  filePath: string;
  diffLines: DiffLine[];
  diffStats: DiffStats;
  /** Override the left-button label. Defaults to t.keepMyChanges. */
  keepLocalLabel?: string;
}>();

const emit = defineEmits<{
  'keep-local': [];
  'load-external': [];
  'merge-apply': [content: string];
  close: [];
}>();

// ── View mode ────────────────────────────────────────────────
type ViewMode = 'diff' | 'merge';
const viewMode = ref<ViewMode>('diff');

// ── Merge state ──────────────────────────────────────────────
const hunks = computed(() => splitIntoHunks(props.diffLines));
// Which change-hunk IDs are accepted (external change kept)
const acceptedIds = ref<Set<number>>(new Set());
// Track which unchanged hunks are expanded
const expandedUnchanged = ref<Set<number>>(new Set());

const changeHunks = computed(() => hunks.value.filter(h => h.type === 'change'));

const toggleHunk = (id: number) => {
  const next = new Set(acceptedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  acceptedIds.value = next;
};

const acceptAll = () => {
  acceptedIds.value = new Set(changeHunks.value.map(h => h.id));
};

const rejectAll = () => {
  acceptedIds.value = new Set();
};

const toggleUnchanged = (id: number) => {
  const next = new Set(expandedUnchanged.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedUnchanged.value = next;
};

const applyMerge = () => {
  const merged = applyHunkSelections(hunks.value, acceptedIds.value);
  emit('merge-apply', merged);
};

// Reset merge state when diffLines change (new conflict opened)
const resetMerge = () => {
  viewMode.value = 'diff';
  acceptedIds.value = new Set();
  expandedUnchanged.value = new Set();
};

// ── Keyboard ────────────────────────────────────────────────
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
            <span class="conflict-filepath" :title="filePath">{{ filePath }}</span>
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
        <!-- Mode toggle -->
        <div class="view-mode-toggle" v-if="diffLines.length > 0">
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'diff' }"
            @click="viewMode = 'diff'"
          >{{ t.diffView }}</button>
          <button
            class="mode-btn"
            :class="{ active: viewMode === 'merge' }"
            @click="() => { viewMode = 'merge'; resetMerge(); viewMode = 'merge'; }"
          >{{ t.mergeView }}</button>
        </div>
      </div>

      <!-- ── DIFF VIEW ── -->
      <div v-if="viewMode === 'diff'" class="conflict-diff-content">
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

      <!-- ── MERGE VIEW ── -->
      <div v-else class="conflict-diff-content merge-view">
        <div class="merge-toolbar">
          <button class="merge-bulk-btn" @click="acceptAll">{{ t.acceptAllExternal }}</button>
          <button class="merge-bulk-btn" @click="rejectAll">{{ t.rejectAllExternal }}</button>
          <span class="merge-hint">{{ t.mergeHint }}</span>
        </div>
        <div
          v-for="hunk in hunks"
          :key="hunk.id"
          class="merge-hunk"
          :class="hunk.type === 'change' ? 'merge-hunk--change' : 'merge-hunk--unchanged'"
        >
          <!-- Unchanged hunk: collapsible -->
          <template v-if="hunk.type === 'unchanged'">
            <button
              v-if="hunk.lines.length > 3"
              class="merge-unchanged-toggle"
              @click="toggleUnchanged(hunk.id)"
            >
              <span v-if="!expandedUnchanged.has(hunk.id)">▶ {{ hunk.lines.length }} {{ t.unchangedLines }}</span>
              <span v-else>▼ {{ t.collapseLines }}</span>
            </button>
            <div
              v-if="hunk.lines.length <= 3 || expandedUnchanged.has(hunk.id)"
              class="conflict-diff-lines"
            >
              <div v-for="(line, i) in hunk.lines" :key="i" class="diff-line diff-line--unchanged">
                <span class="diff-line-number diff-line-number--old">{{ line.oldLineNumber ?? '' }}</span>
                <span class="diff-line-number diff-line-number--new">{{ line.newLineNumber ?? '' }}</span>
                <span class="diff-line-prefix"> </span>
                <span class="diff-line-content">{{ line.content || ' ' }}</span>
              </div>
            </div>
          </template>

          <!-- Change hunk: with accept/reject toggle -->
          <template v-else>
            <div class="merge-hunk-header">
              <span class="merge-hunk-label">{{ t.changeHunk }}</span>
              <div class="merge-hunk-toggle">
                <button
                  class="hunk-btn hunk-btn--reject"
                  :class="{ active: !acceptedIds.has(hunk.id) }"
                  @click="() => { if (acceptedIds.has(hunk.id)) toggleHunk(hunk.id); }"
                  :title="t.keepOriginal"
                >✕ {{ t.keepOriginal }}</button>
                <button
                  class="hunk-btn hunk-btn--accept"
                  :class="{ active: acceptedIds.has(hunk.id) }"
                  @click="() => { if (!acceptedIds.has(hunk.id)) toggleHunk(hunk.id); }"
                  :title="t.acceptExternal"
                >✓ {{ t.acceptExternal }}</button>
              </div>
            </div>
            <div class="conflict-diff-lines">
              <div
                v-for="(line, i) in hunk.lines"
                :key="i"
                class="diff-line"
                :class="[
                  'diff-line--' + line.type,
                  line.type === 'removed' && acceptedIds.has(hunk.id) ? 'line-dimmed' : '',
                  line.type === 'added' && !acceptedIds.has(hunk.id) ? 'line-dimmed' : '',
                ]"
              >
                <span class="diff-line-number diff-line-number--old">{{ line.oldLineNumber ?? '' }}</span>
                <span class="diff-line-number diff-line-number--new">{{ line.newLineNumber ?? '' }}</span>
                <span class="diff-line-prefix">{{ line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ' }}</span>
                <span class="diff-line-content">{{ line.content || ' ' }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ── ACTIONS ── -->
      <div class="conflict-actions">
        <template v-if="viewMode === 'diff'">
          <button class="btn-secondary" @click="emit('keep-local')">
            {{ keepLocalLabel ?? t.keepMyChanges }}
          </button>
          <button class="btn-primary" @click="emit('load-external')">
            {{ t.loadExternalVersion }}
          </button>
        </template>
        <template v-else>
          <button class="btn-secondary" @click="emit('close')">{{ t.cancel }}</button>
          <span class="merge-status">
            {{ acceptedIds.size }}/{{ changeHunks.length }} {{ t.changesAccepted }}
          </span>
          <button class="btn-primary" @click="applyMerge">{{ t.applyMerge }}</button>
        </template>
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

.conflict-filepath {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  font-family: "Fira Code", "Consolas", monospace;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
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

/* ── Mode toggle ─────────────────────────────────────────── */
.view-mode-toggle {
  display: flex;
  gap: 2px;
  margin-left: auto;
  background: var(--bg-secondary, #f0f0f0);
  border-radius: 6px;
  padding: 2px;
}

.mode-btn {
  padding: 4px 12px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: var(--text-muted);
  font-weight: 500;
  transition: all 0.15s;
}

.mode-btn.active {
  background: var(--dialog-bg, white);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}

/* ── Merge view ──────────────────────────────────────────── */
.merge-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--dialog-actions-bg);
  flex-shrink: 0;
}

.merge-bulk-btn {
  padding: 4px 10px;
  font-size: 12px;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  background: var(--bg-primary);
  color: var(--text-secondary);
  transition: all 0.15s;
}

.merge-bulk-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.merge-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: auto;
}

.merge-hunk {
  border-bottom: 1px solid var(--border-primary);
}

.merge-hunk--unchanged {
  background: var(--bg-primary);
}

.merge-hunk--change {
  background: var(--dialog-bg);
}

.merge-unchanged-toggle {
  width: 100%;
  padding: 5px 12px;
  text-align: left;
  font-size: 12px;
  color: var(--text-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-family: "Fira Code", "Consolas", monospace;
}

.merge-unchanged-toggle:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.merge-hunk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--dialog-actions-bg);
}

.merge-hunk-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.merge-hunk-toggle {
  display: flex;
  gap: 4px;
}

.hunk-btn {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-muted);
  transition: all 0.15s;
  font-weight: 500;
}

.hunk-btn--reject.active {
  background: var(--danger-bg, #fee2e2);
  border-color: var(--danger, #ef4444);
  color: var(--danger, #ef4444);
}

.hunk-btn--accept.active {
  background: #d1fae5;
  border-color: #10b981;
  color: #059669;
}

.hunk-btn:not(.active):hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

html.dark .hunk-btn--accept.active {
  background: #064e3b;
  border-color: #34d399;
  color: #34d399;
}

.line-dimmed {
  opacity: 0.35;
  text-decoration: line-through;
}

.merge-status {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
