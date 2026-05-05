<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiSession } from '../../composables/useAiSession';
import { useAiAccessMap } from '../../composables/useAiAccessMap';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiApply } from '../../composables/useAiApply';
import { parseAiOutput } from '../../composables/useAiOutputParser';
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
const { settings } = useSettings();
const ai = useAi();
const session = useAiSession();
const access = useAiAccessMap();
const health = useAiHealth();
const apply = useAiApply();

const selectedCli = ref<CliKind>(settings.value.ai.defaultCli);
const inputValue = ref('');
const pendingTool = ref<{ tool: string; args: unknown } | null>(null);

const availableClis = computed<CliKind[]>(() => {
  const out: CliKind[] = [];
  if (health.cache.value.claude?.ok) out.push('claude');
  if (health.cache.value.codex?.ok) out.push('codex');
  return out.length > 0 ? out : (['claude', 'codex'] as CliKind[]);
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

const sideStyle = computed(() =>
  settings.value.ai.panelSide === 'left'
    ? { left: '0', right: 'auto' }
    : { right: '0', left: 'auto' }
);

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
  return lines.join('\n');
}

function messageHasFence(text: string): boolean {
  return parseAiOutput(text).kind !== 'plain';
}

async function onSend() {
  if (!inputValue.value.trim() || !access.current.value) return;
  const prompt = inputValue.value;
  inputValue.value = '';
  const final = await ai.send({
    cli: selectedCli.value,
    sessionId: session.current.value?.sessionId ?? null,
    prompt,
    preamble: buildPreamble(),
    accessMap: access.current.value,
    workDir: props.workDir,
    onSessionId: async (sid) => {
      await session.persistFromResponse({
        docPath: props.docPath,
        cli: selectedCli.value,
        sessionId: sid,
        docContent: props.docContent,
      });
    },
    onToolRequest: (tool, args) => {
      pendingTool.value = { tool, args };
    },
  });

  const parsed = parseAiOutput(final.text);
  if (parsed.kind !== 'plain') {
    const result = await apply.prepare(parsed, {
      docPath: props.docPath,
      currentContent: props.docContent,
      selectionRange: props.selectionRange,
      sessionId: session.current.value?.sessionId ?? null,
      snapshotsKeep: settings.value.ai.snapshotsKeep,
    });
    if (result.ok && result.newContent) {
      emit('showDiff', props.docContent, result.newContent);
    }
  }
}

async function onCancel() {
  await ai.cancel();
}

async function onSnapshotRestored(content: string) {
  emit('applyContent', content);
}
</script>

<template>
  <aside v-if="props.open && settings.ai.enabled" class="ai-panel" :style="sideStyle">
    <header class="ai-panel__header">
      <strong>{{ t.aiPanelTitle }}</strong>
      <select v-model="selectedCli" class="ai-panel__cli-picker">
        <option v-for="c in availableClis" :key="c" :value="c">{{ c }}</option>
      </select>
      <button class="ai-panel__close" @click="emit('close')">×</button>
    </header>

    <div class="ai-panel__body">
      <AiMessage
        v-for="(m, i) in ai.messages.value"
        :key="i"
        :message="m"
        :has-fence="m.role === 'assistant' && m.done && messageHasFence(m.text)"
      />
    </div>

    <footer class="ai-panel__footer">
      <textarea v-model="inputValue" rows="3" :placeholder="t.aiSendButton" />
      <div class="ai-panel__actions">
        <button v-if="ai.isSending.value" @click="onCancel">{{ t.aiCancelButton }}</button>
        <button v-else @click="onSend" :disabled="!inputValue.trim()">{{ t.aiSendButton }}</button>
      </div>
      <details>
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
  width: 380px;
  background: var(--panel-bg, #fff);
  border-left: 1px solid var(--border-color, #ddd);
  border-right: 1px solid var(--border-color, #ddd);
  display: flex;
  flex-direction: column;
  z-index: 100;
}
.ai-panel__header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color, #ddd);
  display: flex;
  align-items: center;
  gap: 8px;
}
.ai-panel__cli-picker { margin-left: 4px; }
.ai-panel__close { margin-left: auto; background: none; border: none; font-size: 18px; cursor: pointer; }
.ai-panel__body { flex: 1; overflow-y: auto; padding: 8px; }
.ai-panel__footer {
  border-top: 1px solid var(--border-color, #ddd);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ai-panel__footer textarea {
  width: 100%;
  resize: vertical;
  font-family: inherit;
  padding: 6px;
  box-sizing: border-box;
}
.ai-panel__actions { display: flex; justify-content: flex-end; }
</style>
