<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from '../i18n';
const { t } = useI18n();
const props = defineProps<{ title: string; entries: { id: string; label: string; shortcut?: string; enabled: boolean }[] }>();
const emit = defineEmits<{ close: []; pick: [id: string] }>();
const query = ref('');
const selected = ref(0);
const input = ref<HTMLInputElement | null>(null);
const results = computed(() => props.entries.filter(e => e.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
watch(results, () => { selected.value = 0; });
function onKeydown(event: KeyboardEvent) {
  if (!['Escape', 'ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'Enter') {
    const entry = results.value[selected.value];
    if (entry?.enabled) emit('pick', entry.id);
  } else if (results.value.length) {
    selected.value = (selected.value + (event.key === 'ArrowDown' ? 1 : -1) + results.value.length) % results.value.length;
    nextTick(() => document.querySelector('.command-picker [aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }));
  }
}
onMounted(() => { input.value?.focus(); document.addEventListener('keydown', onKeydown); });
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>
<template>
  <Teleport to="body">
    <div class="picker-overlay" @mousedown.self="emit('close')">
      <section class="command-picker" role="dialog" aria-modal="true" :aria-label="title">
        <input ref="input" v-model="query" :placeholder="title" :aria-label="title" role="combobox" aria-controls="command-results" :aria-activedescendant="results[selected] ? `command-result-${selected}` : undefined" :aria-expanded="true" />
        <ul id="command-results" role="listbox">
          <li v-for="(entry, i) in results" :id="`command-result-${i}`" :key="entry.id" role="option" :aria-selected="i === selected" :aria-disabled="!entry.enabled" @mouseenter="selected = i" @click="entry.enabled && emit('pick', entry.id)">
            <span>{{ entry.label }}</span><kbd v-if="entry.shortcut">{{ entry.shortcut }}</kbd>
          </li>
          <li v-if="!results.length">{{ t.noSearchResults }}</li>
        </ul>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.picker-overlay { position: fixed; inset: 0; z-index: 11000; background: var(--overlay-bg); display: flex; justify-content: center; align-items: flex-start; padding-top: 12vh; }
.command-picker { width: min(650px, 92vw); background: var(--dialog-bg); color: var(--text-primary); border: 1px solid var(--border-primary); border-radius: 10px; overflow: hidden; box-shadow: var(--shadow-lg); }
input { box-sizing: border-box; width: 100%; padding: 16px; border: none; border-bottom: 1px solid var(--border-primary); background: transparent; color: inherit; font-size: 15px; outline: none; }
ul { margin: 0; padding: 6px; list-style: none; max-height: 55vh; overflow: auto; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 9px; cursor: pointer; border-radius: 5px; }
li[aria-selected="true"] { background: var(--active-bg); color: var(--active-text); }
li[aria-disabled="true"] { opacity: .45; }
kbd { font-size: 11px; color: var(--text-muted); }
</style>
