<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from '../../i18n';

const { t } = useI18n();

interface Thread {
  id: string;
  title: string;
  updatedAt: string;
  messages: { role: string; text: string }[];
  sessionId?: string | null;
}

const props = defineProps<{
  threads: Thread[];
  activeThreadId: string | null;
}>();

const emit = defineEmits<{
  select: [id: string];
  delete: [id: string];
  ref: [el: HTMLDetailsElement | null];
}>();

const detailsRef = ref<HTMLDetailsElement | null>(null);

watch(detailsRef, (el) => emit('ref', el));

const sortedThreads = computed(() =>
  [...props.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);
</script>

<template>
  <details class="ai-panel__threads" ref="detailsRef">
    <summary class="ai-panel__icon-btn" :title="t.aiThreadCount(threads.length)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h12"/></svg>
    </summary>
    <ul class="ai-panel__threads-list">
      <li v-if="threads.length === 0" class="ai-panel__threads-empty">{{ t.aiThreadEmpty }}</li>
      <li
        v-for="th in sortedThreads"
        :key="th.id"
        class="ai-panel__thread-item"
        :class="{ 'ai-panel__thread-item--active': th.id === activeThreadId }"
        @click="emit('select', th.id)"
      >
        <span class="ai-panel__thread-title">{{ th.title }}</span>
        <span class="ai-panel__thread-meta">{{ new Date(th.updatedAt).toLocaleString() }} · {{ th.messages.length }}</span>
        <button class="ai-panel__thread-del" @click.stop="emit('delete', th.id)" :title="t.aiThreadDelete">×</button>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.ai-panel__threads {
  position: relative;
}
.ai-panel__threads > summary {
  list-style: none;
  cursor: pointer;
}
.ai-panel__threads > summary::-webkit-details-marker { display: none; }
.ai-panel__threads-list {
  position: absolute;
  top: 30px;
  right: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  box-shadow: var(--shadow-dropdown, var(--shadow-lg));
  min-width: 240px;
  max-width: 360px;
  max-height: 340px;
  overflow-y: auto;
  z-index: 50;
}
.ai-panel__threads-empty {
  padding: 10px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
}
.ai-panel__thread-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 2px 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.ai-panel__thread-item:hover { background: var(--hover-bg); }
.ai-panel__thread-item--active { background: var(--active-bg); color: var(--active-text); }
.ai-panel__thread-title {
  grid-column: 1;
  grid-row: 1;
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-panel__thread-meta {
  grid-column: 1;
  grid-row: 2;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--code-font-family, monospace);
}
.ai-panel__thread-del {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  background: transparent;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  border-radius: 4px;
}
.ai-panel__thread-del:hover { color: var(--danger); background: var(--hover-bg); }
.ai-panel__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: transparent;
  color: var(--text-muted);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.ai-panel__icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
</style>
