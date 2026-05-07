<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace } from '../composables/useWorkspace';
import type { OpenWorkspaceEntry } from '../composables/useSettings';
import { basenameOf } from '../utils/path-utils';

/**
 * Command-palette-style switcher for workspaces. Opens with Ctrl/Cmd+Shift+E
 * (or via the search icon in the sidebar header). Lists currently open
 * workspaces first, then recent (closed) workspaces. Type to filter,
 * Up/Down/Enter to navigate, Esc to dismiss.
 *
 * Single-purpose component — no general command palette here, just
 * workspaces. Keeps the surface narrow and the keystroke memorable.
 */

const { t } = useI18n();
const ws = useWorkspace();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);

interface Entry {
  /** Stable key for v-for. */
  key: string;
  /** Either 'open' (currently in the sidebar) or 'recent' (closed but remembered). */
  kind: 'open' | 'recent';
  rootPath: string;
  name: string;
  /** Only set for 'open' entries — used by setActive(). */
  id?: string;
  /** True when this is the workspace whose root contains the active editor file. */
  isActiveContext?: boolean;
}

function buildEntries(): Entry[] {
  const open: Entry[] = ws.openWorkspaces.value.map((w: OpenWorkspaceEntry) => {
    const owning = ws.highlightedPath.value
      ? ws.findOwningWorkspace(ws.highlightedPath.value)
      : null;
    return {
      key: `open:${w.id}`,
      kind: 'open',
      rootPath: w.rootPath,
      name: w.name,
      id: w.id,
      isActiveContext: owning?.id === w.id,
    };
  });
  const recent: Entry[] = ws.recentWorkspaces.value
    .filter((p) => !ws.openWorkspaces.value.some((w) => w.rootPath === p))
    .map((p) => ({
      key: `recent:${p}`,
      kind: 'recent',
      rootPath: p,
      name: basenameOf(p) || p,
    }));
  return [...open, ...recent];
}

const allEntries = computed<Entry[]>(() => buildEntries());

const filteredEntries = computed<Entry[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allEntries.value;
  return allEntries.value.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.rootPath.toLowerCase().includes(q),
  );
});

function clampIndex() {
  const len = filteredEntries.value.length;
  if (len === 0) {
    selectedIndex.value = 0;
    return;
  }
  if (selectedIndex.value < 0) selectedIndex.value = 0;
  if (selectedIndex.value >= len) selectedIndex.value = len - 1;
}

function commitSelection() {
  const entry = filteredEntries.value[selectedIndex.value];
  if (!entry) return;
  if (entry.kind === 'open' && entry.id) {
    ws.setActive(entry.id);
  } else {
    ws.openWorkspace(entry.rootPath).catch((e) => console.error('quick switcher open:', e));
  }
  emit('close');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value++;
    clampIndex();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value--;
    clampIndex();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    commitSelection();
  }
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown);
  await nextTick();
  inputRef.value?.focus();
});

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown);
});

function onPickEntry(idx: number) {
  selectedIndex.value = idx;
  commitSelection();
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <div class="qs-backdrop" @mousedown="onBackdropClick">
      <div class="qs-panel" role="dialog" aria-modal="true">
        <div class="qs-input-row">
          <svg class="qs-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            class="qs-input"
            type="text"
            :placeholder="t.workspaceQuickSwitcherPlaceholder"
            @input="selectedIndex = 0"
          />
          <button class="qs-close" @click="emit('close')">Esc</button>
        </div>

        <div v-if="filteredEntries.length === 0" class="qs-empty">
          {{ t.workspaceQuickSwitcherNoMatches }}
        </div>

        <ul v-else class="qs-list" role="listbox">
          <li
            v-for="(entry, idx) in filteredEntries"
            :key="entry.key"
            :class="['qs-item', { selected: idx === selectedIndex }]"
            role="option"
            :aria-selected="idx === selectedIndex"
            @mouseenter="selectedIndex = idx"
            @click="onPickEntry(idx)"
          >
            <span class="qs-item-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
            </span>
            <span class="qs-item-name">{{ entry.name }}</span>
            <span v-if="entry.isActiveContext" class="qs-item-active-badge">{{ t.activeWorkspaceContext }}</span>
            <span v-else-if="entry.kind === 'open'" class="qs-item-badge open">{{ t.workspaceQuickSwitcherOpenBadge }}</span>
            <span v-else class="qs-item-badge recent">{{ t.workspaceQuickSwitcherRecentBadge }}</span>
            <span class="qs-item-path">{{ entry.rootPath }}</span>
          </li>
        </ul>

        <footer class="qs-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {{ t.qsHintNavigate }}</span>
          <span><kbd>Enter</kbd> {{ t.qsHintOpen }}</span>
          <span><kbd>Esc</kbd> {{ t.qsHintCancel }}</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.qs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: var(--overlay-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

.qs-panel {
  width: min(640px, 92vw);
  max-height: 70vh;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.qs-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-primary);
}

.qs-input-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}

.qs-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  color: var(--text-primary);
}

.qs-input::placeholder {
  color: var(--text-faint);
}

.qs-close {
  border: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-family: var(--code-font-family, monospace);
  cursor: pointer;
}

.qs-close:hover {
  color: var(--text-primary);
}

.qs-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}

.qs-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.qs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 13px;
}

.qs-item.selected {
  background: var(--active-bg);
  color: var(--active-text);
}

.qs-item-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.qs-item.selected .qs-item-icon {
  color: var(--active-text);
}

.qs-item-name {
  font-weight: 500;
  flex-shrink: 0;
}

.qs-item-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.qs-item-badge.open {
  background: var(--active-bg);
  color: var(--active-text);
}

.qs-item-badge.recent {
  background: var(--bg-tertiary);
  color: var(--text-muted);
}

.qs-item-active-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--primary);
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.qs-item-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-muted);
  direction: rtl;
  text-align: left;
}

.qs-item.selected .qs-item-path {
  color: var(--active-text);
  opacity: 0.85;
}

.qs-footer {
  display: flex;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--border-primary);
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-secondary);
}

.qs-footer kbd {
  display: inline-block;
  padding: 1px 5px;
  border: 1px solid var(--border-secondary);
  border-radius: 3px;
  background: var(--bg-tertiary);
  font-family: var(--code-font-family, monospace);
  font-size: 10px;
  margin-right: 3px;
}
</style>
