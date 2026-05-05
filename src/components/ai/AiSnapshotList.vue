<script setup lang="ts">
import { onMounted, watch, computed, ref } from 'vue';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useAiSnapshots } from '../../composables/useAiSnapshots';
import { useI18n } from '../../i18n';

const { t } = useI18n();

const props = defineProps<{ docPath: string }>();
const emit = defineEmits<{ restored: [content: string] }>();

const snapshots = useAiSnapshots();

onMounted(() => snapshots.loadFor(props.docPath));
watch(() => props.docPath, p => snapshots.loadFor(p));

const sortedItems = computed(() =>
  [...snapshots.items.value].sort((a, b) => b.ts.localeCompare(a.ts))
);

const restoring = ref<string | null>(null);

async function onRestore(id: string) {
  if (restoring.value) return;
  restoring.value = id;
  try {
    const content = await snapshots.restore(id);
    emit('restored', content);
    // Force reload of the list so any state drift between calls is reset.
    await snapshots.loadFor(props.docPath);
  } catch (e) {
    console.error('[AiSnapshotList] restore failed:', e);
    window.alert(`Restore failed: ${(e as Error).message}`);
  } finally {
    restoring.value = null;
  }
}

async function onExport(id: string) {
  const dest = await saveDialog({
    defaultPath: 'snapshot.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (dest) await snapshots.exportTo(id, dest);
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}
</script>

<template>
  <details class="ai-snapshots">
    <summary class="ai-snapshots__summary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      <strong>{{ t.aiSnapshotsTitle }}</strong>
      <span class="ai-snapshots__count">{{ snapshots.items.value.length }}</span>
      <small class="ai-snapshots__hint">{{ t.aiSnapshotsHint }}</small>
    </summary>

    <div v-if="sortedItems.length === 0" class="ai-snapshots__empty">
      {{ t.aiSnapshotsEmpty }}
    </div>

    <ul v-else class="ai-snapshots__list">
      <li v-for="(item, idx) in sortedItems" :key="item.id" class="ai-snap-card">
        <div class="ai-snap-card__head">
          <span class="ai-snap-card__num">#{{ sortedItems.length - idx }}</span>
          <span class="ai-snap-card__time" :title="item.ts">{{ formatRelative(item.ts) }}</span>
          <span class="ai-snap-card__size">{{ formatBytes(item.byteSize) }}</span>
          <span v-if="item.pinned" class="ai-snap-card__pin" :title="t.aiSnapshotPinnedBadge">📌</span>
        </div>
        <div class="ai-snap-card__actions">
          <button
            class="ai-snap-card__btn ai-snap-card__btn--primary"
            :disabled="restoring !== null"
            @click="onRestore(item.id)"
            :title="t.aiSnapshotRestoreTooltip"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
            {{ restoring === item.id ? t.aiSnapshotRestoring : t.aiSnapshotRestore }}
          </button>
          <button class="ai-snap-card__btn" @click="snapshots.setPinned(item.id, !item.pinned)" :title="item.pinned ? t.aiSnapshotUnpinTooltip : t.aiSnapshotPinTooltip">
            {{ item.pinned ? t.aiSnapshotUnpin : t.aiSnapshotPin }}
          </button>
          <button class="ai-snap-card__btn" @click="onExport(item.id)" :title="t.aiSnapshotExportTooltip">
            {{ t.aiSnapshotExport }}
          </button>
          <button class="ai-snap-card__btn ai-snap-card__btn--danger" @click="snapshots.remove(item.id)" :title="t.aiSnapshotDeleteTooltip">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>
          </button>
        </div>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.ai-snapshots {
  font-size: 12px;
}
.ai-snapshots__summary {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  cursor: pointer;
  color: var(--text-secondary, var(--text-muted));
  user-select: none;
  list-style: none;
}
.ai-snapshots__summary::-webkit-details-marker { display: none; }
.ai-snapshots__summary:hover { color: var(--text-primary); }
.ai-snapshots__summary strong { font-weight: 600; }
.ai-snapshots__count {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  min-width: 22px;
  text-align: center;
}
.ai-snapshots__hint {
  margin-left: auto;
  opacity: 0.6;
  font-weight: normal;
  font-size: 11px;
}

.ai-snapshots__empty {
  padding: 14px 12px;
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-top: 6px;
}

.ai-snapshots__list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-snap-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 8px 10px;
  transition: background 100ms ease, border-color 100ms ease;
}
.ai-snap-card:hover {
  background: var(--hover-bg, var(--bg-tertiary));
  border-color: var(--border-secondary, var(--border-primary));
}
.ai-snap-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 11px;
}
.ai-snap-card__num {
  font-weight: 700;
  color: var(--primary);
  font-family: var(--code-font-family, monospace);
}
.ai-snap-card__time {
  color: var(--text-primary);
  font-weight: 500;
}
.ai-snap-card__size {
  margin-left: auto;
  color: var(--text-muted);
  font-family: var(--code-font-family, monospace);
}
.ai-snap-card__pin { font-size: 10px; }
.ai-snap-card__actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.ai-snap-card__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 11px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.ai-snap-card__btn:hover {
  background: var(--hover-bg);
}
.ai-snap-card__btn--primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
  font-weight: 600;
}
.ai-snap-card__btn--primary:hover {
  background: var(--primary-hover, var(--primary));
  filter: brightness(1.1);
}
.ai-snap-card__btn--danger {
  margin-left: auto;
  color: var(--danger);
  padding: 4px 6px;
}
.ai-snap-card__btn--danger:hover {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
}
</style>
