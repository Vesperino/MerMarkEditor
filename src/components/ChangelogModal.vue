<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { markdownToHtml } from '../utils/markdown-converter';
import { useI18n } from '../i18n';
import { getAll, type ReleaseEntry } from '../services/releaseNotes';
import '../styles/release-notes.css';

const props = defineProps<{
  initialVersion?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const { t } = useI18n();
const entries = ref<ReleaseEntry[]>([]);
const selectedVersion = ref<string | null>(null);

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => {
  entries.value = getAll();
  selectedVersion.value =
    (props.initialVersion && entries.value.some((e) => e.version === props.initialVersion)
      ? props.initialVersion
      : entries.value[0]?.version) ?? null;
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const selectedEntry = computed<ReleaseEntry | null>(() =>
  entries.value.find((e) => e.version === selectedVersion.value) ?? null,
);

const renderedHtml = computed(() =>
  selectedEntry.value ? markdownToHtml(selectedEntry.value.markdown) : '',
);
</script>

<template>
  <div class="changelog-overlay" @click.self="emit('close')">
    <div class="changelog-panel">
      <div class="changelog-header">
        <h3>{{ t.changelog }}</h3>
        <button @click="emit('close')" class="changelog-close-btn" :title="t.close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="changelog-body">
        <aside class="changelog-list">
          <button
            v-for="entry in entries"
            :key="entry.version"
            class="changelog-list-item"
            :class="{ 'is-selected': entry.version === selectedVersion }"
            @click="selectedVersion = entry.version"
          >
            <span class="changelog-list-tag">{{ entry.tag }}</span>
            <span class="changelog-list-title">{{ entry.title }}</span>
          </button>
        </aside>
        <section class="changelog-detail">
          <div
            v-if="selectedEntry"
            class="release-notes-content"
            v-html="renderedHtml"
          ></div>
          <div v-else class="changelog-empty">{{ t.noReleaseNotesForBuild }}</div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-overlay {
  position: fixed; inset: 0;
  background: var(--overlay-bg);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}
.changelog-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 920px; max-width: 96%;
  height: 80vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.changelog-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}
.changelog-header h3 { margin: 0; font-size: 16px; color: var(--text-primary); font-weight: 600; }
.changelog-close-btn {
  background: none; border: none; cursor: pointer;
  padding: 4px; border-radius: 4px;
  color: var(--text-muted); display: flex; align-items: center; justify-content: center;
}
.changelog-close-btn:hover { background: var(--hover-bg); color: var(--text-primary); }
.changelog-body { flex: 1; display: flex; min-height: 0; }
.changelog-list {
  width: 220px; flex-shrink: 0;
  border-right: 1px solid var(--border-primary);
  overflow-y: auto; padding: 8px 0;
}
.changelog-list-item {
  width: 100%; text-align: left;
  background: none; border: none; cursor: pointer;
  padding: 8px 14px;
  display: flex; flex-direction: column; gap: 2px;
  color: var(--text-secondary); font-size: 13px;
}
.changelog-list-item:hover { background: var(--hover-bg); }
.changelog-list-item.is-selected { background: var(--bg-secondary); color: var(--text-primary); }
.changelog-list-tag { font-family: var(--code-font-family, 'Fira Code', 'Consolas', monospace); font-size: 12px; color: var(--primary); }
.changelog-list-title { font-size: 13px; }
.changelog-detail { flex: 1; padding: 20px 24px; overflow-y: auto; }
.changelog-empty { color: var(--text-muted); font-size: 14px; text-align: center; padding: 32px 0; }
</style>
