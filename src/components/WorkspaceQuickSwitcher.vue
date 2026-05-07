<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useI18n } from '../i18n';
import { useWorkspace } from '../composables/useWorkspace';
import type { OpenWorkspaceEntry } from '../composables/useSettings';
import type { WorkspaceNode } from '../services/workspaceFs';
import { workspaceFs, type ContentSearchHit } from '../services/workspaceFs';
import { basenameOf } from '../utils/path-utils';

/**
 * Command-palette-style switcher (Ctrl/Cmd+Shift+E or sidebar search icon).
 *
 * Three result kinds, presented as one navigable list:
 *   1. Workspaces — open or recent (badges identify which).
 *   2. Files — markdown files inside any open workspace, matched by name.
 *      Pulled live from the in-memory tree (no IPC roundtrip).
 *   3. Content — substring matches inside the actual file bodies. Backed
 *      by `search_workspace_content` which caps work to keep large
 *      workspaces interactive (5k files / 4 s budget). Triggered after a
 *      150 ms debounce so typing isn't laggy.
 *
 * Up/Down/Enter to commit. Esc to dismiss. Click works too.
 */

const { t } = useI18n();
const ws = useWorkspace();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-file', path: string): void;
}>();

const query = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);
const contentHits = ref<ContentSearchHit[]>([]);
const contentTruncated = ref(false);
const contentSearching = ref(false);

interface WorkspaceEntry {
  kind: 'workspace';
  key: string;
  rootPath: string;
  name: string;
  id?: string;
  workspaceKind: 'open' | 'recent';
  isActiveContext?: boolean;
}

interface FileEntry {
  kind: 'file';
  key: string;
  path: string;
  name: string;
  workspaceName: string;
}

interface ContentEntry {
  kind: 'content';
  key: string;
  path: string;
  name: string;
  workspaceName: string;
  line: number;
  snippet: string;
}

type Entry = WorkspaceEntry | FileEntry | ContentEntry;

// ===== Workspace entries (cheap, in-memory) =====
function buildWorkspaceEntries(): WorkspaceEntry[] {
  const open: WorkspaceEntry[] = ws.openWorkspaces.value.map((w: OpenWorkspaceEntry) => {
    const owning = ws.highlightedPath.value
      ? ws.findOwningWorkspace(ws.highlightedPath.value)
      : null;
    return {
      kind: 'workspace',
      key: `open:${w.id}`,
      rootPath: w.rootPath,
      name: w.name,
      id: w.id,
      workspaceKind: 'open',
      isActiveContext: owning?.id === w.id,
    };
  });
  const recent: WorkspaceEntry[] = ws.recentWorkspaces.value
    .filter((p) => !ws.openWorkspaces.value.some((w) => w.rootPath === p))
    .map((p) => ({
      kind: 'workspace',
      key: `recent:${p}`,
      rootPath: p,
      name: basenameOf(p) || p,
      workspaceKind: 'recent',
    }));
  return [...open, ...recent];
}

// ===== File entries (cheap, in-memory tree walk) =====
function collectFiles(node: WorkspaceNode | null, workspaceName: string, out: { path: string; name: string; workspaceName: string }[]) {
  if (!node) return;
  if (node.kind === 'file') {
    out.push({ path: node.path, name: node.name, workspaceName });
    return;
  }
  for (const child of node.children ?? []) {
    collectFiles(child, workspaceName, out);
  }
}

const allFilesInWorkspaces = computed(() => {
  const out: { path: string; name: string; workspaceName: string }[] = [];
  for (const w of ws.openWorkspaces.value) {
    const tree = ws.treesById.value[w.id];
    collectFiles(tree, w.name, out);
  }
  return out;
});

// ===== Filtering =====
const trimmed = computed(() => query.value.trim());
const lower = computed(() => trimmed.value.toLowerCase());

const filteredWorkspaces = computed<WorkspaceEntry[]>(() => {
  const all = buildWorkspaceEntries();
  if (!lower.value) return all;
  return all.filter(
    (e) =>
      e.name.toLowerCase().includes(lower.value) ||
      e.rootPath.toLowerCase().includes(lower.value),
  );
});

const filteredFiles = computed<FileEntry[]>(() => {
  if (!lower.value) return [];
  const q = lower.value;
  return allFilesInWorkspaces.value
    .filter((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
    .slice(0, 80)
    .map((f) => ({
      kind: 'file' as const,
      key: `file:${f.path}`,
      path: f.path,
      name: f.name,
      workspaceName: f.workspaceName,
    }));
});

const contentEntries = computed<ContentEntry[]>(() => {
  return contentHits.value.map((h) => {
    const owning = ws.findOwningWorkspace(h.path);
    return {
      kind: 'content' as const,
      key: `content:${h.path}:${h.line}`,
      path: h.path,
      name: basenameOf(h.path),
      workspaceName: owning?.name ?? '',
      line: h.line,
      snippet: h.snippet,
    };
  });
});

const flatEntries = computed<Entry[]>(() => [
  ...filteredWorkspaces.value,
  ...filteredFiles.value,
  ...contentEntries.value,
]);

// ===== Content search (async, debounced) =====
let contentDebounce: ReturnType<typeof setTimeout> | null = null;
let lastQueryToken = 0;

async function runContentSearch(q: string) {
  if (!q) {
    contentHits.value = [];
    contentTruncated.value = false;
    contentSearching.value = false;
    return;
  }
  // Skip very short queries — they'd match too much and the IPC cost isn't
  // worth it. 2-char minimum gives the user useful feedback after a few keys.
  if (q.length < 2) {
    contentHits.value = [];
    return;
  }
  const roots = ws.openWorkspaces.value.map((w) => w.rootPath);
  if (roots.length === 0) {
    contentHits.value = [];
    return;
  }
  const token = ++lastQueryToken;
  contentSearching.value = true;
  try {
    const hits = await workspaceFs.searchContent(roots, q);
    if (token !== lastQueryToken) return; // stale
    contentHits.value = hits;
    contentTruncated.value = hits.length >= 200;
  } catch (e) {
    if (token !== lastQueryToken) return;
    console.error('content search:', e);
    contentHits.value = [];
  } finally {
    if (token === lastQueryToken) contentSearching.value = false;
  }
}

watch(trimmed, (q) => {
  if (contentDebounce) clearTimeout(contentDebounce);
  // 150 ms feels responsive without spamming IPC mid-keystroke.
  contentDebounce = setTimeout(() => runContentSearch(q), 150);
});

// ===== Selection / commit =====
function clampIndex() {
  const len = flatEntries.value.length;
  if (len === 0) {
    selectedIndex.value = 0;
    return;
  }
  if (selectedIndex.value < 0) selectedIndex.value = 0;
  if (selectedIndex.value >= len) selectedIndex.value = len - 1;
}

watch(flatEntries, () => {
  // When the query changes the list shrinks/expands — keep selection valid.
  if (selectedIndex.value >= flatEntries.value.length) {
    selectedIndex.value = 0;
  }
});

function commitSelection() {
  const entry = flatEntries.value[selectedIndex.value];
  if (!entry) return;
  if (entry.kind === 'workspace') {
    if (entry.workspaceKind === 'open' && entry.id) {
      ws.setActive(entry.id);
    } else {
      ws.openWorkspace(entry.rootPath).catch((e) => console.error('open:', e));
    }
    emit('close');
    return;
  }
  // File or content — open the file.
  emit('open-file', entry.path);
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
  if (contentDebounce) clearTimeout(contentDebounce);
});

function onPickEntry(idx: number) {
  selectedIndex.value = idx;
  commitSelection();
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close');
}

// Highlight the matched substring inside snippets / names.
function highlightMatch(text: string): { before: string; match: string; after: string } | null {
  const q = lower.value;
  if (!q) return null;
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  return {
    before: text.slice(0, idx),
    match: text.slice(idx, idx + q.length),
    after: text.slice(idx + q.length),
  };
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
          <span v-if="contentSearching" class="qs-spinner" :title="t.qsContentSearching"></span>
          <button class="qs-close" @click="emit('close')">Esc</button>
        </div>

        <div v-if="flatEntries.length === 0" class="qs-empty">
          {{ t.workspaceQuickSwitcherNoMatches }}
        </div>

        <ul v-else class="qs-list" role="listbox">
          <!-- Workspaces -->
          <template v-if="filteredWorkspaces.length > 0">
            <li class="qs-section-label">{{ t.workspaces }}</li>
            <li
              v-for="(entry, idx) in filteredWorkspaces"
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
              <span class="qs-item-name">
                <template v-if="highlightMatch(entry.name)">
                  {{ highlightMatch(entry.name)!.before }}<mark>{{ highlightMatch(entry.name)!.match }}</mark>{{ highlightMatch(entry.name)!.after }}
                </template>
                <template v-else>{{ entry.name }}</template>
              </span>
              <span v-if="entry.isActiveContext" class="qs-item-active-badge">{{ t.activeWorkspaceContext }}</span>
              <span v-else-if="entry.workspaceKind === 'open'" class="qs-item-badge open">{{ t.workspaceQuickSwitcherOpenBadge }}</span>
              <span v-else class="qs-item-badge recent">{{ t.workspaceQuickSwitcherRecentBadge }}</span>
              <span class="qs-item-path">{{ entry.rootPath }}</span>
            </li>
          </template>

          <!-- Files (by name) -->
          <template v-if="filteredFiles.length > 0">
            <li class="qs-section-label">{{ t.qsSectionFiles }}</li>
            <li
              v-for="(entry, fi) in filteredFiles"
              :key="entry.key"
              :class="['qs-item', { selected: filteredWorkspaces.length + fi === selectedIndex }]"
              role="option"
              :aria-selected="filteredWorkspaces.length + fi === selectedIndex"
              @mouseenter="selectedIndex = filteredWorkspaces.length + fi"
              @click="onPickEntry(filteredWorkspaces.length + fi)"
            >
              <span class="qs-item-icon file">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </span>
              <span class="qs-item-name">
                <template v-if="highlightMatch(entry.name)">
                  {{ highlightMatch(entry.name)!.before }}<mark>{{ highlightMatch(entry.name)!.match }}</mark>{{ highlightMatch(entry.name)!.after }}
                </template>
                <template v-else>{{ entry.name }}</template>
              </span>
              <span class="qs-item-workspace">{{ entry.workspaceName }}</span>
              <span class="qs-item-path">{{ entry.path }}</span>
            </li>
          </template>

          <!-- Content matches -->
          <template v-if="contentEntries.length > 0">
            <li class="qs-section-label">
              {{ t.qsSectionContent }}
              <span v-if="contentTruncated" class="qs-truncated">{{ t.qsContentTruncated }}</span>
            </li>
            <li
              v-for="(entry, ci) in contentEntries"
              :key="entry.key"
              :class="['qs-item', 'qs-item-content', { selected: filteredWorkspaces.length + filteredFiles.length + ci === selectedIndex }]"
              role="option"
              :aria-selected="filteredWorkspaces.length + filteredFiles.length + ci === selectedIndex"
              @mouseenter="selectedIndex = filteredWorkspaces.length + filteredFiles.length + ci"
              @click="onPickEntry(filteredWorkspaces.length + filteredFiles.length + ci)"
            >
              <span class="qs-item-icon content">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </span>
              <div class="qs-item-content-body">
                <div class="qs-item-content-head">
                  <span class="qs-item-name">{{ entry.name }}</span>
                  <span class="qs-item-line">:{{ entry.line }}</span>
                  <span v-if="entry.workspaceName" class="qs-item-workspace">{{ entry.workspaceName }}</span>
                </div>
                <div class="qs-item-snippet">
                  <template v-if="highlightMatch(entry.snippet)">
                    {{ highlightMatch(entry.snippet)!.before }}<mark>{{ highlightMatch(entry.snippet)!.match }}</mark>{{ highlightMatch(entry.snippet)!.after }}
                  </template>
                  <template v-else>{{ entry.snippet }}</template>
                </div>
              </div>
            </li>
          </template>
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
  width: min(720px, 92vw);
  max-height: 76vh;
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

.qs-spinner {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border-secondary);
  border-top-color: var(--primary);
  animation: qs-spin 0.7s linear infinite;
}

@keyframes qs-spin {
  to { transform: rotate(360deg); }
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

.qs-section-label {
  padding: 10px 10px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.qs-truncated {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  text-transform: none;
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

.qs-item.qs-item-content {
  align-items: flex-start;
  padding: 8px 10px;
}

.qs-item.selected {
  background: var(--active-bg);
  color: var(--active-text);
}

.qs-item-icon {
  color: var(--primary);
  flex-shrink: 0;
}

.qs-item-icon.file {
  color: var(--text-muted);
}

.qs-item-icon.content {
  color: var(--danger);
  margin-top: 1px;
}

.qs-item.selected .qs-item-icon {
  color: var(--active-text);
}

.qs-item-content-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 0;
}

.qs-item-content-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.qs-item-name {
  font-weight: 500;
  flex-shrink: 0;
}

.qs-item-line {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--code-font-family, monospace);
  flex-shrink: 0;
}

.qs-item-workspace {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.qs-item-snippet {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: var(--code-font-family, monospace);
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.qs-item.selected .qs-item-snippet {
  color: var(--active-text);
}

.qs-item-name :deep(mark),
.qs-item-snippet :deep(mark) {
  background: var(--primary);
  color: white;
  padding: 0 2px;
  border-radius: 2px;
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
  min-width: 0;
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
