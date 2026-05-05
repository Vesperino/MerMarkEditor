<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../i18n';
import { useAiSnapshots } from '../../composables/useAiSnapshots';

const props = defineProps<{ docPath: string }>();
const emit = defineEmits<{ restored: [content: string] }>();

const { t } = useI18n();
const snapshots = useAiSnapshots();

onMounted(() => snapshots.loadFor(props.docPath));
watch(() => props.docPath, p => snapshots.loadFor(p));

async function onRestore(id: string) {
  const content = await snapshots.restore(id);
  emit('restored', content);
}

async function onExport(id: string) {
  const dest = await saveDialog({
    defaultPath: 'snapshot.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (dest) await snapshots.exportTo(id, dest);
}
</script>

<template>
  <details class="ai-snapshots">
    <summary>Document snapshots ({{ snapshots.items.value.length }})
      <small style="opacity:0.6;font-weight:normal;">— file revisions saved before each AI edit</small>
    </summary>
    <ul>
      <li v-for="item in snapshots.items.value" :key="item.id">
        <span class="ai-snap__ts">{{ item.ts }}</span>
        <span class="ai-snap__size">{{ item.byteSize }} B</span>
        <span v-if="item.pinned" class="ai-snap__pin">📌</span>
        <button @click="onRestore(item.id)">{{ t.aiHistoryRestore }}</button>
        <button @click="snapshots.setPinned(item.id, !item.pinned)">
          {{ item.pinned ? t.aiHistoryUnpin : t.aiHistoryPin }}
        </button>
        <button @click="onExport(item.id)">{{ t.aiHistoryExport }}</button>
        <button @click="snapshots.remove(item.id)">{{ t.aiHistoryDelete }}</button>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.ai-snapshots ul { list-style: none; padding: 0; margin: 6px 0 0; }
.ai-snapshots li {
  display: grid;
  grid-template-columns: 1fr auto auto auto auto auto auto;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
  font-size: 12px;
}
.ai-snap__ts { font-family: var(--code-font-family, monospace); }
.ai-snap__size { opacity: .6; }
</style>
