<script setup lang="ts">
import { ref, watch } from 'vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../i18n';
import type { AccessMap } from '../../services/aiCommands';

const props = defineProps<{ modelValue: AccessMap }>();
const emit = defineEmits<{ 'update:modelValue': [m: AccessMap] }>();

const { t } = useI18n();
const local = ref<AccessMap>(JSON.parse(JSON.stringify(props.modelValue)));
watch(
  () => props.modelValue,
  v => { local.value = JSON.parse(JSON.stringify(v)); },
  { deep: true },
);

function emitUpdate() {
  emit('update:modelValue', JSON.parse(JSON.stringify(local.value)));
}

async function addPath(target: 'readPaths' | 'writePaths') {
  const sel = await openDialog({ multiple: true });
  const arr = Array.isArray(sel) ? sel : sel ? [sel] : [];
  if (!arr.length) return;
  for (const p of arr) {
    if (!local.value[target].includes(p)) local.value[target].push(p);
  }
  emitUpdate();
}

function removePath(target: 'readPaths' | 'writePaths', i: number) {
  local.value[target].splice(i, 1);
  emitUpdate();
}
</script>

<template>
  <div class="ai-access-editor">
    <h4>{{ t.aiAccessMapTitle }}</h4>
    <section>
      <h5>{{ t.aiAccessReadPaths }}</h5>
      <ul>
        <li v-for="(p, i) in local.readPaths" :key="p">
          <code>{{ p }}</code>
          <button @click="removePath('readPaths', i)">×</button>
        </li>
      </ul>
      <button @click="addPath('readPaths')">+</button>
    </section>
    <section>
      <h5>{{ t.aiAccessWritePaths }}</h5>
      <ul>
        <li v-for="(p, i) in local.writePaths" :key="p">
          <code>{{ p }}</code>
          <button @click="removePath('writePaths', i)">×</button>
        </li>
      </ul>
      <button @click="addPath('writePaths')">+</button>
    </section>
    <section>
      <h5>{{ t.aiAccessTools }}</h5>
      <label><input type="checkbox" v-model="local.tools.bash" @change="emitUpdate" /> {{ t.aiAccessToolBash }}</label>
      <label><input type="checkbox" v-model="local.tools.network" @change="emitUpdate" /> {{ t.aiAccessToolNetwork }}</label>
      <label><input type="checkbox" v-model="local.tools.fileRead" @change="emitUpdate" /> {{ t.aiAccessToolFileRead }}</label>
      <label><input type="checkbox" v-model="local.tools.fileWrite" @change="emitUpdate" /> {{ t.aiAccessToolFileWrite }}</label>
    </section>
  </div>
</template>

<style scoped>
.ai-access-editor section { padding: 6px 0; }
.ai-access-editor ul { list-style: none; padding: 0; margin: 4px 0; }
.ai-access-editor li { display: flex; gap: 6px; align-items: center; }
.ai-access-editor label { display: block; padding: 2px 0; }
</style>
