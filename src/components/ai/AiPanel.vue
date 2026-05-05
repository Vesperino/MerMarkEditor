<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, watchEffect } from 'vue';
import { htmlToMarkdown } from '../../utils/markdown-converter';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiSession } from '../../composables/useAiSession';
import { useAiAccessMap } from '../../composables/useAiAccessMap';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiApply } from '../../composables/useAiApply';
import { parseAiOutput } from '../../composables/useAiOutputParser';
import { modelsFor, effortsFor, CUSTOM_MODEL_SENTINEL } from '../../composables/useAiModels';
import AiMessage from './AiMessage.vue';
import AiSnapshotList from './AiSnapshotList.vue';
import AiAccessMapEditor from './AiAccessMapEditor.vue';
import { useAiContext } from '../../composables/useAiContext';
import { aiCommands } from '../../services/aiCommands';

const props = defineProps<{
  open: boolean;
  docPath: string;
  docContent: string;
  selectionRange: { start: number; end: number } | null;
  workDir: string;
}>();

const emit = defineEmits<{
  close: [];
  applyContent: [content: string];
  showDiff: [orig: string, candidate: string];
}>();

const { t } = useI18n();
const { settings, setAiDefaultCli, setAiDefaultModelClaude, setAiDefaultModelCodex, setAiEffortClaude, setAiEffortCodex } = useSettings();
const ai = useAi();
const session = useAiSession();
const access = useAiAccessMap();
const health = useAiHealth();
useAiApply(); // kept for potential future restoration of fence flow
const aiContext = useAiContext();

const selectedCli = ref<CliKind>(settings.value.ai.defaultCli);
const selectedModel = ref<string>(
  selectedCli.value === 'claude'
    ? settings.value.ai.defaultModelClaude
    : settings.value.ai.defaultModelCodex
);
const selectedEffort = ref<string>(
  selectedCli.value === 'claude'
    ? settings.value.ai.effortClaude
    : settings.value.ai.effortCodex
);
const customModelInput = ref<string>('');
const inputValue = ref('');
const fullscreen = ref(false);
// Tool activity ribbon: AI emits a tool_request, we surface it for ~3s as a
// small inline indicator so the user sees what's happening. The actual
// permission gate lives in the spawned CLI (--permission-mode + --allowedTools).
const toolActivity = ref<string | null>(null);
let toolActivityTimer: number | null = null;
const messagesEl = ref<HTMLElement | null>(null);
const threadsDetails = ref<HTMLDetailsElement | null>(null);

function onWindowClick(e: MouseEvent) {
  // Close threads dropdown when clicking outside it.
  const det = threadsDetails.value;
  if (det && det.open && !det.contains(e.target as Node)) {
    det.removeAttribute('open');
  }
}

// Large doc truncation
const LARGE_DOC_THRESHOLD = 200 * 1024;
const sendFullDocOverride = ref(false);

const docMarkdown = computed(() => {
  const c = props.docContent;
  if (!c) return '';
  if (c.trimStart().startsWith('<')) {
    try { return htmlToMarkdown(c); } catch { return c; }
  }
  return c;
});

const docTooLarge = computed(() => docMarkdown.value.length > LARGE_DOC_THRESHOLD);

const availableClis = computed<CliKind[]>(() => {
  const out: CliKind[] = [];
  if (health.cache.value.claude?.ok) out.push('claude');
  if (health.cache.value.codex?.ok) out.push('codex');
  return out.length > 0 ? out : (['claude', 'codex'] as CliKind[]);
});

const modelOptions = computed(() => modelsFor(selectedCli.value));
const effortOptions = computed(() => effortsFor(selectedCli.value));
const cliConnected = computed(() => health.cache.value[selectedCli.value]?.ok ?? false);
const anyHealthLoading = computed(() => health.loading.value.claude || health.loading.value.codex);

const isCustomModel = computed(() => {
  const opts = modelOptions.value;
  return !opts.some(o => o.id === selectedModel.value && !o.custom);
});

watchEffect(() => {
  if (isCustomModel.value && !customModelInput.value) {
    customModelInput.value = selectedModel.value;
  }
});

function onSelectModel(id: string) {
  if (id === CUSTOM_MODEL_SENTINEL) {
    customModelInput.value = customModelInput.value || selectedModel.value;
    selectedModel.value = customModelInput.value || '';
  } else {
    selectedModel.value = id;
  }
}

watch(selectedCli, (cli) => {
  setAiDefaultCli(cli);
  selectedModel.value = cli === 'claude'
    ? settings.value.ai.defaultModelClaude
    : settings.value.ai.defaultModelCodex;
  selectedEffort.value = cli === 'claude'
    ? settings.value.ai.effortClaude
    : settings.value.ai.effortCodex;
  aiContext.reset(cli);
});

watch(selectedModel, (m) => {
  if (selectedCli.value === 'claude') setAiDefaultModelClaude(m);
  else setAiDefaultModelCodex(m);
});

watch(selectedEffort, (e) => {
  if (selectedCli.value === 'claude') setAiEffortClaude(e);
  else setAiEffortCodex(e);
});

const sideStyle = computed(() => {
  if (fullscreen.value) return {};
  return settings.value.ai.panelSide === 'left'
    ? { left: '0', right: 'auto' }
    : { right: '0', left: 'auto' };
});

function onGlobalKeydown(e: KeyboardEvent) {
  // Esc closes the panel UNLESS the user is editing the composer (avoid losing input).
  if (e.key === 'Escape' && !fullscreen.value) {
    const target = e.target as HTMLElement | null;
    const isInput = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
    if (!isInput) emit('close');
  }
  if (e.key === 'Escape' && fullscreen.value) {
    fullscreen.value = false;
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('click', onWindowClick);
  if (props.docPath) {
    ai.bindDoc(props.docPath);
    await Promise.all([
      session.loadFor(props.docPath),
      access.loadFor(props.docPath),
      health.checkAll().catch(() => {}),
    ]);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('click', onWindowClick);
});

watch(() => props.docPath, async (p) => {
  if (p) {
    ai.bindDoc(p);
    await session.loadFor(p);
    await access.loadFor(p);
  }
});

watch(() => ai.messages.value.length, () => {
  setTimeout(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
  }, 0);
});

function buildPreamble(): string {
  const sel = props.selectionRange
    ? `Selection: yes (${props.selectionRange.start}-${props.selectionRange.end})`
    : 'Selection: none';
  const am = access.current.value;
  const tools = am
    ? Object.entries(am.tools).filter(([, v]) => v).map(([k]) => k).join(',') || 'none'
    : 'unknown';
  const lines = [
    `You are an AI assistant integrated into the MerMark editor.`,
    `Active file: ${props.docPath}`,
    sel,
    `Read paths: ${am?.readPaths.join(', ') ?? props.docPath}`,
    `Write paths: ${am?.writePaths.join(', ') ?? props.docPath}`,
    `Allowed tools: ${tools}`,
    ``,
    `When the user asks for edits to the active file, USE YOUR Edit / Write TOOLS to modify the file on disk directly. Do NOT return code fences with the proposed change — the host will reload the editor from disk after you finish.`,
    ``,
    `For chat-only answers (questions about the file, summaries, suggestions), respond as plain text without editing the file.`,
  ];
  if (docTooLarge.value && !sendFullDocOverride.value) {
    lines.push('', `Note: the active document is large (${docMarkdown.value.length} bytes). Focus on the first 200KB unless instructed otherwise.`);
  }
  return lines.join('\n');
}

function messageHasFence(text: string): boolean {
  return parseAiOutput(text).kind !== 'plain';
}

async function onSend() {
  if (!inputValue.value.trim() || !access.current.value) return;
  const prompt = inputValue.value;
  inputValue.value = '';

  // Pre-send snapshot from DISK (not from editor HTML — file is the truth).
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const onDiskBefore = await readTextFile(props.docPath);
    await aiCommands.snapshotCreate(
      props.docPath,
      onDiskBefore,
      session.current.value?.sessionId ?? null,
      settings.value.ai.snapshotsKeep,
    );
  } catch (e) {
    console.warn('[AiPanel] pre-send snapshot failed (continuing anyway):', e);
  }

  const final = await ai.send({
    cli: selectedCli.value,
    sessionId: session.current.value?.sessionId ?? null,
    model: selectedModel.value,
    effort: selectedEffort.value,
    prompt,
    preamble: buildPreamble(),
    accessMap: access.current.value,
    workDir: props.workDir,
    onSessionId: async (sid) => {
      await session.persistFromResponse({
        docPath: props.docPath,
        cli: selectedCli.value,
        sessionId: sid,
        docContent: docMarkdown.value,
      });
    },
    onToolRequest: (tool) => {
      toolActivity.value = tool;
      if (toolActivityTimer != null) window.clearTimeout(toolActivityTimer);
      toolActivityTimer = window.setTimeout(() => { toolActivity.value = null; }, 3000);
    },
  });

  // The existing useFileWatcher in App.vue will fire when AI's Edit/Write tool
  // touches the file. The fence-based apply flow is no longer used.
  console.log('[AiPanel] response final length:', final.text.length);
}

async function onCancel() { await ai.cancel(); }

async function revertLastSnapshot() {
  try {
    const items = await aiCommands.snapshotList(props.docPath);
    if (items.length === 0) {
      window.alert('No snapshots to revert to.');
      return;
    }
    // Newest first.
    const sorted = [...items].sort((a, b) => b.ts.localeCompare(a.ts));
    const latest = sorted[0];
    const ok = window.confirm(`Revert to snapshot from ${latest.ts}?`);
    if (!ok) return;
    const content = await aiCommands.snapshotRestore(props.docPath, latest.id);
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(props.docPath, content);
    // Tell App.vue to reload (skips diff — revert matches disk).
    emit('applyContent', content);
  } catch (e) {
    console.error('[AiPanel] revert failed:', e);
    window.alert(`Revert failed: ${(e as Error).message}`);
  }
}

async function onSnapshotRestored(content: string) { emit('applyContent', content); }

function onKeydownComposer(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onSend();
  }
}

function newChat() {
  ai.startNewThread();
  session.startNew();
  aiContext.reset(selectedCli.value);
}

function onSelectThread(id: string) {
  ai.selectThread(id);
  // Reset session+context — selecting an old thread starts a fresh CLI session
  // because our sessions store only tracks one mapping per doc. Resume via
  // sessionId could be wired later if the thread carries it.
  const t = ai.threads.value.find(x => x.id === id);
  if (t?.sessionId) {
    // Best-effort: tell session-store about it. (Sessions composable currently
    // loads from doc path; deeper wiring is a Sub-2/3 concern.)
  }
  aiContext.reset(selectedCli.value);
}

function onDeleteThread(id: string) {
  ai.deleteThread(id);
}
</script>

<template>
  <aside
    v-if="props.open && settings.ai.enabled"
    class="ai-panel"
    :class="{ 'ai-panel--fullscreen': fullscreen, 'ai-panel--left': settings.ai.panelSide === 'left' && !fullscreen }"
    :style="sideStyle"
  >
    <header class="ai-panel__header">
      <div class="ai-panel__title-group">
        <svg class="ai-panel__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v1H7a4 4 0 0 0-4 4v3a4 4 0 0 0 2 3.46V20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.54A4 4 0 0 0 21 13v-3a4 4 0 0 0-4-4h-2V5a3 3 0 0 0-3-3z"/>
          <circle cx="9" cy="13" r="1"/>
          <circle cx="15" cy="13" r="1"/>
        </svg>
        <strong>{{ t.aiPanelTitle }}</strong>
      </div>

      <div class="ai-panel__model-group">
        <span
          class="ai-panel__status-dot"
          :class="cliConnected ? 'ai-panel__status-dot--ok' : 'ai-panel__status-dot--err'"
          :title="cliConnected ? t.aiStatusOk(health.cache.value[selectedCli]?.account ?? '') : t.aiStatusAuthRequired"
        />
        <select v-model="selectedCli" class="ai-panel__select" :title="t.aiDefaultCli">
          <option v-for="c in availableClis" :key="c" :value="c">{{ c === 'claude' ? 'Claude' : 'Codex' }}</option>
        </select>
        <select
          class="ai-panel__select ai-panel__select--model"
          :value="isCustomModel ? CUSTOM_MODEL_SENTINEL : selectedModel"
          @change="onSelectModel(($event.target as HTMLSelectElement).value)"
          :title="t.aiModel"
        >
          <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
        <input
          v-if="isCustomModel"
          class="ai-panel__select ai-panel__select--custom"
          type="text"
          :value="customModelInput"
          @input="customModelInput = ($event.target as HTMLInputElement).value; selectedModel = customModelInput"
          placeholder="model id"
          :title="t.aiModel"
        />
        <select v-model="selectedEffort" class="ai-panel__select" :title="'Effort'">
          <option v-for="e in effortOptions" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </div>

      <div class="ai-panel__actions">
        <button
          class="ai-panel__icon-btn"
          @click="revertLastSnapshot"
          title="Revert to last snapshot before AI edit"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/></svg>
        </button>
        <details class="ai-panel__threads" ref="threadsDetails">
          <summary class="ai-panel__icon-btn" :title="`${ai.threads.value.length} chat(s)`">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h12"/></svg>
          </summary>
          <ul class="ai-panel__threads-list">
            <li v-if="ai.threads.value.length === 0" class="ai-panel__threads-empty">No chats yet</li>
            <li
              v-for="th in [...ai.threads.value].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))"
              :key="th.id"
              class="ai-panel__thread-item"
              :class="{ 'ai-panel__thread-item--active': th.id === ai.activeThreadId.value }"
              @click="onSelectThread(th.id)"
            >
              <span class="ai-panel__thread-title">{{ th.title }}</span>
              <span class="ai-panel__thread-meta">{{ new Date(th.updatedAt).toLocaleString() }} · {{ th.messages.length }}</span>
              <button class="ai-panel__thread-del" @click.stop="onDeleteThread(th.id)" title="Delete chat">×</button>
            </li>
          </ul>
        </details>
        <button class="ai-panel__icon-btn" @click="newChat" :title="t.aiNewChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="ai-panel__icon-btn" @click="fullscreen = !fullscreen" :title="fullscreen ? t.aiExitFullscreen : t.aiFullscreen">
          <svg v-if="!fullscreen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>
        </button>
        <button class="ai-panel__icon-btn ai-panel__close" @click="emit('close')" :title="`${t.aiClose} (Esc)`">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </header>

    <details v-if="!aiContext.usage.value.empty" class="ai-panel__context">
      <summary class="ai-panel__context-summary">
        <div class="ai-panel__context-bar">
          <div
            v-for="seg in aiContext.usage.value.breakdown.filter(b => b.key !== 'free')"
            :key="seg.key"
            class="ai-panel__context-seg"
            :style="{ width: seg.pct + '%', background: seg.color }"
            :title="`${seg.label}: ${seg.tokens.toLocaleString()} (${seg.pct.toFixed(1)}%)`"
          />
        </div>
        <span class="ai-panel__context-label">
          {{ aiContext.usageLabel.value }}
        </span>
      </summary>
      <ul class="ai-panel__context-breakdown">
        <li v-for="seg in aiContext.usage.value.breakdown" :key="seg.key">
          <span class="ai-panel__context-dot" :style="{ background: seg.color }" />
          <span class="ai-panel__context-name">{{ seg.label }}</span>
          <span class="ai-panel__context-num">{{ seg.tokens.toLocaleString() }}</span>
          <span class="ai-panel__context-pct">{{ seg.pct.toFixed(1) }}%</span>
        </li>
        <li v-if="aiContext.usage.value.outputTokens > 0" class="ai-panel__context-extra">
          <span class="ai-panel__context-name">Output (this turn)</span>
          <span class="ai-panel__context-num">{{ aiContext.usage.value.outputTokens.toLocaleString() }}</span>
        </li>
      </ul>
    </details>

    <div v-if="anyHealthLoading" class="ai-panel__connecting">
      <span class="ai-panel__spinner" aria-hidden="true" />
      <span>Connecting to AI CLI…</span>
    </div>

    <div ref="messagesEl" class="ai-panel__messages">
      <div v-if="ai.messages.value.length === 0 && !anyHealthLoading" class="ai-panel__empty">
        <p>{{ cliConnected ? t.aiEmptyHint : t.aiStatusAuthRequired }}</p>
        <p class="ai-panel__empty-hint">{{ t.aiEmptyKeyHint }}</p>
      </div>
      <AiMessage
        v-for="(m, i) in ai.messages.value"
        :key="i"
        :message="m"
        :has-fence="m.role === 'assistant' && m.done && messageHasFence(m.text)"
      />
    </div>

    <footer class="ai-panel__composer">
      <div v-if="docTooLarge" class="ai-panel__warn">
        Document is large ({{ Math.round(docMarkdown.length / 1024) }} KB).
        <label><input type="checkbox" v-model="sendFullDocOverride" /> Send full document</label>
      </div>
      <textarea
        v-model="inputValue"
        class="ai-panel__input"
        :placeholder="cliConnected ? 'Type a message…' : t.aiStatusAuthRequired"
        :disabled="!cliConnected"
        rows="3"
        @keydown="onKeydownComposer"
      />
      <div class="ai-panel__composer-actions">
        <span class="ai-panel__hint">{{ t.aiEmptyKeyHint }}</span>
        <button v-if="ai.isSending.value" class="ai-panel__btn ai-panel__btn--secondary" @click="onCancel">{{ t.aiCancelButton }}</button>
        <button v-else class="ai-panel__btn ai-panel__btn--primary" @click="onSend" :disabled="!inputValue.trim() || !cliConnected">{{ t.aiSendButton }}</button>
      </div>
      <details class="ai-panel__details">
        <summary>{{ t.aiAccessMapTitle }}</summary>
        <AiAccessMapEditor
          v-if="access.current.value"
          :model-value="access.current.value"
          @update:model-value="access.save($event)"
        />
      </details>
      <AiSnapshotList :doc-path="props.docPath" @restored="onSnapshotRestored" />
    </footer>

    <Transition name="ai-tool">
      <div v-if="toolActivity" class="ai-panel__tool-toast">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        <span>AI used {{ toolActivity }}</span>
      </div>
    </Transition>
  </aside>
</template>

<style scoped>
.ai-panel {
  position: fixed;
  /* Start below the app toolbar so its controls (zoom, etc.) stay reachable. */
  top: var(--toolbar-height, 44px);
  bottom: 0;
  width: 420px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border-left: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: var(--shadow-lg);
}
.ai-panel--left {
  border-left: none;
  border-right: 1px solid var(--border-primary);
}
.ai-panel--fullscreen {
  top: 0; left: 0; right: 0; bottom: 0;
  width: auto;
  border: none;
  border-radius: 0;
}

.ai-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(180deg, var(--toolbar-gradient-from), var(--toolbar-gradient-to));
  border-bottom: 1px solid var(--border-primary);
  flex-wrap: wrap;
}
.ai-panel__title-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.ai-panel__icon {
  color: var(--primary);
}
.ai-panel__model-group {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.ai-panel__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ai-panel__status-dot--ok { background: var(--success); box-shadow: 0 0 0 2px rgba(16,185,129,0.18); }
.ai-panel__status-dot--err { background: var(--danger); }
.ai-panel__select {
  background: var(--bg-input, var(--bg-secondary));
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  cursor: pointer;
}
.ai-panel__select--model {
  min-width: 110px;
}
.ai-panel__select--custom { min-width: 130px; }
.ai-panel__actions {
  display: flex;
  gap: 4px;
}
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
  transition: background 100ms ease, color 100ms ease;
}
.ai-panel__icon-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.ai-panel__bypass--on {
  background: var(--diff-removed-bg, #fef3c7);
  color: var(--split-toggle-color, #b45309);
}
.ai-panel__bypass--on:hover {
  background: var(--diff-removed-bg, #fde68a);
  color: var(--split-toggle-color, #b45309);
}

/* Threads dropdown */
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

.ai-panel__messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ai-panel__empty {
  margin: auto;
  text-align: center;
  color: var(--text-muted);
}
.ai-panel__empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 6px;
}

.ai-panel__connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-muted);
  font-size: 12px;
}
.ai-panel__spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border-primary);
  border-top-color: var(--primary);
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

.ai-panel__composer {
  border-top: 1px solid var(--border-primary);
  padding: 10px 12px;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-panel__warn {
  font-size: 12px;
  background: var(--diff-removed-bg, rgba(239, 68, 68, 0.08));
  color: var(--diff-removed-text, #dc2626);
  padding: 6px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.ai-panel__input {
  width: 100%;
  resize: vertical;
  min-height: 60px;
  padding: 8px 10px;
  background: var(--bg-input, var(--bg-primary));
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition: border-color 100ms ease, box-shadow 100ms ease;
  box-sizing: border-box;
}
.ai-panel__input:focus {
  border-color: var(--focus-ring, var(--primary));
  box-shadow: 0 0 0 3px var(--focus-ring-alpha, rgba(37, 99, 235, 0.15));
}
.ai-panel__input:disabled { opacity: .6; cursor: not-allowed; }

.ai-panel__composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}
.ai-panel__hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-right: auto;
  font-family: var(--code-font-family, monospace);
}
.ai-panel__btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 100ms ease;
}
.ai-panel__btn--primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.ai-panel__btn--primary:hover:not(:disabled) { background: var(--primary-hover, var(--primary)); filter: brightness(1.1); }
.ai-panel__btn--primary:disabled { opacity: .5; cursor: not-allowed; }
.ai-panel__btn--secondary {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--border-primary);
}
.ai-panel__btn--secondary:hover { background: var(--hover-bg); }

.ai-panel__details {
  font-size: 12px;
}
.ai-panel__details > summary {
  padding: 6px 0;
  cursor: pointer;
  color: var(--text-secondary, var(--text-muted));
  user-select: none;
}
.ai-panel__details > summary:hover { color: var(--text-primary); }

.ai-panel__tool-toast {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  font-size: 12px;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
  z-index: 5;
}
.ai-tool-enter-active, .ai-tool-leave-active { transition: opacity 200ms ease, transform 200ms ease; }
.ai-tool-enter-from, .ai-tool-leave-to { opacity: 0; transform: translate(-50%, 8px); }

.ai-panel__context {
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-muted);
}
.ai-panel__context-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  list-style: none;
}
.ai-panel__context-summary::-webkit-details-marker { display: none; }
.ai-panel__context-seg {
  height: 100%;
  transition: width 220ms ease;
}
.ai-panel__context-breakdown {
  list-style: none;
  margin: 0;
  padding: 4px 12px 10px 12px;
  display: grid;
  gap: 4px;
  background: var(--bg-tertiary);
}
.ai-panel__context-breakdown li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}
.ai-panel__context-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ai-panel__context-num {
  font-family: var(--code-font-family, monospace);
  color: var(--text-secondary, var(--text-primary));
}
.ai-panel__context-pct {
  font-family: var(--code-font-family, monospace);
  color: var(--text-muted);
  min-width: 42px;
  text-align: right;
}
.ai-panel__context-extra .ai-panel__context-name {
  grid-column: 2;
  opacity: 0.7;
  font-style: italic;
}
.ai-panel__context-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}
.ai-panel__context-fill {
  height: 100%;
  background: var(--primary);
  transition: width 220ms ease;
}
.ai-panel__context-fill.ai-panel__context-fill--warn {
  background: var(--danger);
}
.ai-panel__context-label {
  font-family: var(--code-font-family, monospace);
  white-space: nowrap;
  cursor: help;
}
</style>
