<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../i18n';
import type { AccessMap } from '../../services/aiCommands';

const { t } = useI18n();

const props = defineProps<{ modelValue: AccessMap }>();
const emit = defineEmits<{ 'update:modelValue': [m: AccessMap] }>();

const local = ref<AccessMap>(JSON.parse(JSON.stringify(props.modelValue)));
watch(() => props.modelValue, v => { local.value = JSON.parse(JSON.stringify(v)); }, { deep: true });

function emitUpdate() { emit('update:modelValue', JSON.parse(JSON.stringify(local.value))); }

async function addPath(target: 'readPaths' | 'writePaths') {
  const sel = await openDialog({ multiple: true });
  const arr = Array.isArray(sel) ? sel : sel ? [sel] : [];
  if (!arr.length) return;
  for (const p of arr) if (!local.value[target].includes(p)) local.value[target].push(p);
  emitUpdate();
}

async function addFolder(target: 'readPaths' | 'writePaths') {
  const sel = await openDialog({ directory: true, multiple: false });
  if (!sel || Array.isArray(sel)) return;
  if (!local.value[target].includes(sel)) local.value[target].push(sel);
  emitUpdate();
}

function removePath(target: 'readPaths' | 'writePaths', i: number) {
  local.value[target].splice(i, 1);
  emitUpdate();
}

interface ToolDef {
  key: 'fileRead' | 'fileWrite' | 'bash' | 'network';
  label: string;
  desc: string;
  icon: string;
  warn?: boolean;
}
const TOOLS = computed<ToolDef[]>(() => [
  { key: 'fileRead', label: t.value.aiAccessToolFileRead, desc: t.value.aiAccessToolFileReadDesc, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6' },
  { key: 'fileWrite', label: t.value.aiAccessToolFileWrite, desc: t.value.aiAccessToolFileWriteDesc, icon: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' },
  { key: 'bash', label: t.value.aiAccessToolBash, desc: t.value.aiAccessToolBashDesc, icon: 'M4 17l6-6-6-6 M12 19h8', warn: true },
  { key: 'network', label: t.value.aiAccessToolNetwork, desc: t.value.aiAccessToolNetworkDesc, icon: 'M21 12c0 5-4 9-9 9s-9-4-9-9 4-9 9-9 9 4 9 9z M3 12h18 M12 3a15 15 0 0 1 0 18 M12 3a15 15 0 0 0 0 18', warn: true },
]);

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}
</script>

<template>
  <div class="ai-access-editor">
    <section class="ai-access-section">
      <div class="ai-access-section__head">
        <h5>Allowed tools</h5>
        <small>What the AI can do on your behalf</small>
      </div>
      <ul class="ai-access-tools">
        <li v-for="tool in TOOLS" :key="tool.key" class="ai-access-tool" :class="{ 'ai-access-tool--on': local.tools[tool.key], 'ai-access-tool--warn': tool.warn && local.tools[tool.key] }">
          <span class="ai-access-tool__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path :d="tool.icon"/>
            </svg>
          </span>
          <span class="ai-access-tool__text">
            <span class="ai-access-tool__label">{{ tool.label }}</span>
            <span class="ai-access-tool__desc">{{ tool.desc }}</span>
          </span>
          <label class="ai-access-toggle">
            <input
              type="checkbox"
              v-model="local.tools[tool.key]"
              @change="emitUpdate"
            />
            <span class="ai-access-toggle__slider" />
          </label>
        </li>
      </ul>
    </section>

    <section class="ai-access-section">
      <div class="ai-access-section__head">
        <h5>Readable files</h5>
        <span class="ai-access-add-group">
          <button class="ai-access-add" @click="addPath('readPaths')">+ File</button>
          <button class="ai-access-add" @click="addFolder('readPaths')">+ Folder</button>
        </span>
      </div>
      <ul v-if="local.readPaths.length > 0" class="ai-access-paths">
        <li v-for="(p, i) in local.readPaths" :key="p">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
          <span class="ai-access-path__name" :title="p">{{ basename(p) }}</span>
          <button class="ai-access-path__rm" @click="removePath('readPaths', i)" title="Remove">×</button>
        </li>
      </ul>
      <p v-else class="ai-access-paths__empty">No files. Click + Add.</p>
    </section>

    <section class="ai-access-section">
      <div class="ai-access-section__head">
        <h5>Writable files</h5>
        <span class="ai-access-add-group">
          <button class="ai-access-add" @click="addPath('writePaths')">+ File</button>
          <button class="ai-access-add" @click="addFolder('writePaths')">+ Folder</button>
        </span>
      </div>
      <ul v-if="local.writePaths.length > 0" class="ai-access-paths">
        <li v-for="(p, i) in local.writePaths" :key="p">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span class="ai-access-path__name" :title="p">{{ basename(p) }}</span>
          <button class="ai-access-path__rm" @click="removePath('writePaths', i)" title="Remove">×</button>
        </li>
      </ul>
      <p v-else class="ai-access-paths__empty">No files. Click + Add.</p>
    </section>
  </div>
</template>

<style scoped>
.ai-access-editor { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
.ai-access-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.ai-access-section__head h5 {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary, var(--text-muted));
}
.ai-access-section__head small {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
}
.ai-access-add-group {
  margin-left: auto;
  display: inline-flex;
  gap: 4px;
}
.ai-access-add {
  padding: 3px 10px;
  font-size: 11px;
  background: var(--bg-primary);
  color: var(--primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}
.ai-access-add:hover { background: var(--hover-bg); }

/* Tools list */
.ai-access-tools { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ai-access-tool {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  transition: border-color 100ms ease;
}
.ai-access-tool--on { border-color: var(--primary); }
.ai-access-tool--warn { border-color: var(--danger); background: rgba(239, 68, 68, 0.04); }
.ai-access-tool__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  color: var(--text-secondary, var(--text-muted));
  flex-shrink: 0;
}
.ai-access-tool--on .ai-access-tool__icon { background: var(--active-bg); color: var(--primary); }
.ai-access-tool--warn .ai-access-tool__icon { background: rgba(239, 68, 68, 0.12); color: var(--danger); }
.ai-access-tool__text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ai-access-tool__label { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.ai-access-tool__desc { font-size: 11px; color: var(--text-muted); }

/* Toggle switch */
.ai-access-toggle { position: relative; display: inline-block; width: 32px; height: 18px; flex-shrink: 0; }
.ai-access-toggle input { opacity: 0; width: 0; height: 0; }
.ai-access-toggle__slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--text-faint, #94a3b8);
  border-radius: 18px;
  transition: background 150ms ease;
}
.ai-access-toggle__slider::before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background: white;
  border-radius: 50%;
  transition: transform 150ms ease;
}
.ai-access-toggle input:checked + .ai-access-toggle__slider { background: var(--primary); }
.ai-access-toggle input:checked + .ai-access-toggle__slider::before { transform: translateX(14px); }

/* Path lists */
.ai-access-paths { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.ai-access-paths li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 12px;
}
.ai-access-paths li > svg { color: var(--text-muted); flex-shrink: 0; }
.ai-access-path__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--code-font-family, monospace);
}
.ai-access-path__rm {
  background: transparent;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 14px;
  padding: 0 4px;
  border-radius: 3px;
}
.ai-access-path__rm:hover { color: var(--danger); background: var(--hover-bg); }

.ai-access-paths__empty {
  margin: 4px 0 0;
  padding: 8px;
  text-align: center;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
  background: var(--bg-secondary);
  border-radius: 4px;
}
</style>
