<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from '../i18n';
import { useSettings } from '../composables/useSettings';
import { useAppCommandDispatcher } from '../composables/useAppCommands';
import { formatShortcut, paletteCommands } from '../composables/useCommandShortcuts';
import { isReservedShortcut, shortcutFromEvent, shortcutsOverlap } from '../utils/shortcut-preferences';
const { t } = useI18n();
const { settings } = useSettings();
const commands = useAppCommandDispatcher();
const query = ref('');
const editing = ref<{ id: string; index: number } | null>(null);
const candidate = ref('');
const message = ref('');
const recorder = ref<HTMLInputElement | null>(null);
const rows = computed(() => paletteCommands(commands?.menus.value ?? [])
  .filter(c => !['cut', 'copy', 'paste', 'select-all'].includes(c.id) && !c.id.startsWith('recent-') && !c.id.startsWith('token-model:')));
const visible = computed(() => rows.value.filter(c => `${c.label} ${[c.accelerator, ...(c.aliases ?? [])].filter(Boolean).map(k => formatShortcut(k!)).join(' ')}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
const keysFor = (id: string) => {
  const command = rows.value.find(c => c.id === id);
  return [command?.accelerator, ...(command?.aliases ?? [])].filter((key): key is string => !!key);
};
function update(id: string, keys: string[] | null) {
  const overrides = { ...settings.value.keyboardShortcuts };
  if (keys === null) delete overrides[id]; else overrides[id] = keys;
  settings.value.keyboardShortcuts = overrides;
}
async function begin(id: string, index: number) {
  if (index >= 8) return;
  editing.value = { id, index }; candidate.value = ''; message.value = '';
  await nextTick(); recorder.value?.focus();
}
function cancel() { editing.value = null; candidate.value = ''; message.value = ''; }
function record(event: KeyboardEvent) {
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.key === 'Escape') { cancel(); return; }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) return;
  const shortcut = shortcutFromEvent(event);
  candidate.value = shortcut ?? '';
  message.value = !shortcut ? t.value.shortcutInvalid : isReservedShortcut(shortcut) ? t.value.shortcutReserved : '';
  if (!shortcut || message.value) return;
  const conflict = rows.value.find(row => row.id !== editing.value?.id && keysFor(row.id).some(key => shortcutsOverlap(key, shortcut)));
  if (conflict) message.value = t.value.shortcutConflict(conflict.label);
}
function save() {
  if (!editing.value || !candidate.value || message.value) return;
  const { id, index } = editing.value;
  const keys = keysFor(id);
  const conflict = rows.value.find(row => row.id !== id && keysFor(row.id).some(key => shortcutsOverlap(key, candidate.value)));
  if (conflict) { message.value = t.value.shortcutConflict(conflict.label); return; }
  if (keys.some((key, i) => i !== index && shortcutsOverlap(key, candidate.value))) {
    message.value = t.value.shortcutConflict(rows.value.find(c => c.id === id)?.label ?? ''); return;
  }
  keys[index] = candidate.value;
  update(id, keys); cancel();
}
function remove(id: string, index: number) { update(id, keysFor(id).filter((_, i) => i !== index)); cancel(); }
function resetAll() { settings.value.keyboardShortcuts = {}; cancel(); }
</script>
<template>
  <div class="keyboard-settings">
    <h4>{{ t.keyboardShortcuts }}</h4>
    <p>{{ t.shortcutSettingsHelp }}</p>
    <div class="keyboard-tools">
      <input v-model="query" type="search" :placeholder="t.shortcutSearch" :aria-label="t.shortcutSearch" />
      <button type="button" @click="resetAll">{{ t.shortcutResetAll }}</button>
    </div>
    <table>
      <thead><tr><th>{{ t.shortcutAction }}</th><th>{{ t.shortcutKey }}</th><th>{{ t.shortcutReset }}</th></tr></thead>
      <tbody>
        <tr v-for="row in visible" :key="row.id">
          <td>{{ row.label }}</td>
          <td>
            <div class="bindings">
              <span v-for="(key, i) in keysFor(row.id)" :key="key" class="binding">
                <button type="button" :aria-label="`${t.shortcutChange}: ${row.label} (${formatShortcut(key)})`" @click="begin(row.id, i)"><kbd>{{ formatShortcut(key) }}</kbd></button>
                <button type="button" :aria-label="`${t.shortcutRemove}: ${row.label} (${formatShortcut(key)})`" @click="remove(row.id, i)">×</button>
              </span>
              <span v-if="!keysFor(row.id).length" class="unassigned">{{ t.shortcutUnassigned }}</span>
              <button type="button" :disabled="keysFor(row.id).length >= 8" :aria-label="`${t.shortcutAdd}: ${row.label}`" @click="begin(row.id, keysFor(row.id).length)">+</button>
            </div>
            <div v-if="editing?.id === row.id" class="recording">
              <input :ref="(el) => { recorder = el as HTMLInputElement | null; }" data-shortcut-recorder readonly :value="candidate ? formatShortcut(candidate) : ''" :placeholder="t.shortcutRecord" :aria-label="t.shortcutRecord" @keydown="record" />
              <button type="button" :disabled="!candidate || !!message" @click="save">{{ t.save }}</button>
              <button type="button" @click="cancel">{{ t.cancel }}</button>
              <p v-if="message" role="alert">{{ message }}</p>
            </div>
          </td>
          <td><button type="button" :disabled="!Object.prototype.hasOwnProperty.call(settings.keyboardShortcuts, row.id)" :aria-label="`${t.shortcutReset}: ${row.label}`" @click="update(row.id, null); cancel()">{{ t.shortcutReset }}</button></td>
        </tr>
      </tbody>
    </table>
    <p v-if="!visible.length">{{ t.noSearchResults }}</p>
  </div>
</template>
<style scoped>
.keyboard-settings h4 { margin: 0 0 10px; }
.keyboard-settings p { color: var(--text-muted); font-size: 12px; line-height: 1.5; }
.keyboard-tools { display: flex; gap: 10px; margin: 18px 0; }
input { background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-primary); border-radius: 6px; padding: 8px; min-width: 0; }
.keyboard-tools input { flex: 1; }
button { border: 1px solid var(--border-primary); border-radius: 5px; padding: 5px 8px; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; }
button:hover { background: var(--bg-hover); }
button:disabled { opacity: .45; cursor: default; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; color: var(--text-muted); font-weight: 500; }
th, td { padding: 12px 5px; border-bottom: 1px solid var(--border-primary); vertical-align: top; }
td:first-child { width: 40%; }
.bindings { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.binding { display: inline-flex; gap: 1px; }
kbd { white-space: nowrap; }
.unassigned { color: var(--text-muted); font-style: italic; }
.recording { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.recording input { flex: 1; width: 160px; }
.recording p { width: 100%; margin: 0; color: var(--danger, #d33); }
</style>
