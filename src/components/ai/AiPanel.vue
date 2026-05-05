<script setup lang="ts">
import { computed, onMounted, ref, watch, watchEffect } from 'vue';
import { htmlToMarkdown } from '../../utils/markdown-converter';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind } from '../../composables/useSettings';
import { useAi, type AiMessage as AiMessageT } from '../../composables/useAi';
import { useAiSession } from '../../composables/useAiSession';
import { useAiAccessMap } from '../../composables/useAiAccessMap';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiApply } from '../../composables/useAiApply';
import { parseAiOutput } from '../../composables/useAiOutputParser';
import { modelsFor, effortsFor, CUSTOM_MODEL_SENTINEL } from '../../composables/useAiModels';
import AiMessage from './AiMessage.vue';
import AiSnapshotList from './AiSnapshotList.vue';
import AiAccessMapEditor from './AiAccessMapEditor.vue';
import AiToolConfirmModal from './AiToolConfirmModal.vue';

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
const apply = useAiApply();

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

const inputValue = ref('');
const pendingTool = ref<{ tool: string; args: unknown } | null>(null);
const fullscreen = ref(false);
const messagesEl = ref<HTMLElement | null>(null);

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

watch(selectedCli, (cli) => {
  setAiDefaultCli(cli);
  selectedModel.value = cli === 'claude'
    ? settings.value.ai.defaultModelClaude
    : settings.value.ai.defaultModelCodex;
  selectedEffort.value = cli === 'claude'
    ? settings.value.ai.effortClaude
    : settings.value.ai.effortCodex;
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

onMounted(async () => {
  if (props.docPath) {
    await Promise.all([
      session.loadFor(props.docPath),
      access.loadFor(props.docPath),
      health.checkAll().catch(() => {}),
    ]);
  }
});

watch(() => props.docPath, async (p) => {
  if (p) {
    await session.loadFor(p);
    await access.loadFor(p);
    ai.clearMessages();
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
    `When proposing edits, wrap your change in either:`,
    `  \`\`\`mermark-replace ... \`\`\`  (full new content of the active doc, or selection replacement)`,
    `  \`\`\`mermark-patch ... \`\`\`    (unified diff against the current doc)`,
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

  const startHash = await session.sha1Hex(docMarkdown.value);

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
    onToolRequest: (tool, args) => {
      pendingTool.value = { tool, args };
    },
  });

  const parsed = parseAiOutput(final.text);
  if (parsed.kind !== 'plain') {
    const nowHash = await session.sha1Hex(docMarkdown.value);
    if (nowHash !== startHash) {
      const proceed = window.confirm('Document changed during the AI request. Apply suggested changes anyway?');
      if (!proceed) return;
    }
    const result = await apply.prepare(parsed, {
      docPath: props.docPath,
      currentContent: docMarkdown.value,
      selectionRange: props.selectionRange,
      sessionId: session.current.value?.sessionId ?? null,
      snapshotsKeep: settings.value.ai.snapshotsKeep,
    });
    if (result.ok && result.newContent) {
      emit('showDiff', docMarkdown.value, result.newContent);
    }
  }
}

async function onCancel() { await ai.cancel(); }

async function onMessageApply(message: AiMessageT) {
  const parsed = parseAiOutput(message.text);
  if (parsed.kind === 'plain' || !access.current.value) return;
  const result = await apply.prepare(parsed, {
    docPath: props.docPath,
    currentContent: docMarkdown.value,
    selectionRange: props.selectionRange,
    sessionId: session.current.value?.sessionId ?? null,
    snapshotsKeep: settings.value.ai.snapshotsKeep,
  });
  if (result.ok && result.newContent && result.tmpPath) {
    emit('applyContent', result.newContent);
    await apply.commitTmp(result.tmpPath);
  }
}

function onMessageReject(_message: AiMessageT) {}

function onMessageShowDiff(message: AiMessageT) {
  const parsed = parseAiOutput(message.text);
  if (parsed.kind === 'plain') return;
  let candidate: string;
  if (parsed.kind === 'replace') {
    candidate = props.selectionRange
      ? docMarkdown.value.slice(0, props.selectionRange.start) + parsed.payload + docMarkdown.value.slice(props.selectionRange.end)
      : parsed.payload;
  } else {
    candidate = parsed.payload;
  }
  emit('showDiff', docMarkdown.value, candidate);
}

async function onSnapshotRestored(content: string) { emit('applyContent', content); }

function onKeydownComposer(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    onSend();
  }
}

function newChat() {
  ai.clearMessages();
  session.startNew();
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
        <button class="ai-panel__icon-btn" @click="newChat" :title="t.aiNewChat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="ai-panel__icon-btn" @click="fullscreen = !fullscreen" :title="fullscreen ? t.aiExitFullscreen : t.aiFullscreen">
          <svg v-if="!fullscreen" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></svg>
          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg>
        </button>
        <button class="ai-panel__icon-btn ai-panel__close" @click="emit('close')" :title="t.aiClose">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </header>

    <div ref="messagesEl" class="ai-panel__messages">
      <div v-if="ai.messages.value.length === 0" class="ai-panel__empty">
        <p>{{ cliConnected ? t.aiEmptyHint : t.aiStatusAuthRequired }}</p>
        <p class="ai-panel__empty-hint">{{ t.aiEmptyKeyHint }}</p>
      </div>
      <AiMessage
        v-for="(m, i) in ai.messages.value"
        :key="i"
        :message="m"
        :has-fence="m.role === 'assistant' && m.done && messageHasFence(m.text)"
        @apply="onMessageApply(m)"
        @reject="onMessageReject(m)"
        @show-diff="onMessageShowDiff(m)"
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

    <AiToolConfirmModal
      v-if="pendingTool"
      :tool="pendingTool.tool"
      :args="pendingTool.args"
      @allow="pendingTool = null"
      @deny="pendingTool = null"
    />
  </aside>
</template>

<style scoped>
.ai-panel {
  position: fixed;
  top: 0;
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
</style>
