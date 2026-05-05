<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { htmlToMarkdown } from '../../utils/markdown-converter';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiSession } from '../../composables/useAiSession';
import { useAiAccessMap } from '../../composables/useAiAccessMap';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiContext } from '../../composables/useAiContext';
import { modelsFor, effortsFor } from '../../composables/useAiModels';
import { aiCommands } from '../../services/aiCommands';
import { useAiPanelLayout } from '../../composables/useAiPanelLayout';
import { useAiToolToast } from '../../composables/useAiToolToast';
import { useAiPinnedSelections } from '../../composables/useAiPinnedSelections';
import { useAiPendingImages, type PendingImage } from '../../composables/useAiPendingImages';
import { buildPreamble } from '../../composables/useAiPreamble';
import AiPanelTab from './AiPanelTab.vue';
import AiPanelHeader from './AiPanelHeader.vue';
import AiPanelContextBar from './AiPanelContextBar.vue';
import AiPanelStatusNotices from './AiPanelStatusNotices.vue';
import AiPanelMessages from './AiPanelMessages.vue';
import AiPanelComposer from './AiPanelComposer.vue';
import AiAttachmentModal from './AiAttachmentModal.vue';
import AiImagePreview from './AiImagePreview.vue';
import AiToolToast from './AiToolToast.vue';

const props = defineProps<{
  open: boolean;
  docPath: string;
  docContent: string;
  selectionRange: { start: number; end: number } | null;
  selectionText?: string;
  workDir: string;
}>();

const emit = defineEmits<{
  close: [];
  applyContent: [content: string];
  showDiff: [orig: string, candidate: string];
  linkClick: [url: string];
}>();

const { t } = useI18n();
const { settings, setAiDefaultCli, setAiDefaultModelClaude, setAiDefaultModelCodex, setAiEffortClaude, setAiEffortCodex } = useSettings();
const ai = useAi();
const session = useAiSession();
const access = useAiAccessMap();
const health = useAiHealth();
const aiContext = useAiContext();

const docNeedsSave = computed<boolean>(() => !props.docPath || props.docPath.trim() === '');

const selectedCli = ref<CliKind>(settings.value.ai.defaultCli);
const selectedModel = ref<string>(
  selectedCli.value === 'claude'
    ? settings.value.ai.defaultModelClaude
    : settings.value.ai.defaultModelCodex,
);
const selectedEffort = ref<string>(
  selectedCli.value === 'claude'
    ? settings.value.ai.effortClaude
    : settings.value.ai.effortCodex,
);
const customModelInput = ref<string>('');
const inputValue = ref('');

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

const liveSelectionText = computed<string | null>(() => {
  if (typeof props.selectionText === 'string') {
    const trimmed = props.selectionText.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const range = props.selectionRange;
  if (!range) return null;
  const md = docMarkdown.value;
  if (!md) return null;
  const start = Math.max(0, Math.min(md.length, range.start));
  const end = Math.max(start, Math.min(md.length, range.end));
  return md.slice(start, end).trim();
});

const pins = useAiPinnedSelections({ liveSelectionText });
const images = useAiPendingImages();
const toolToast = useAiToolToast();
const layout = useAiPanelLayout({
  panelSide: () => settings.value.ai.panelSide,
  onClose: () => emit('close'),
  onPreviewDismiss: () => {
    if (images.previewedImage.value) {
      images.previewedImage.value = null;
      return true;
    }
    return false;
  },
});

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

watch(isCustomModel, (custom) => {
  if (custom && !customModelInput.value) {
    customModelInput.value = selectedModel.value;
  }
}, { immediate: true });

// True while we're applying a thread's stored CLI/model/effort during a
// thread switch — suppresses the "CLI changed → new thread" side effect so
// the just-restored thread isn't immediately wiped out.
const restoringThread = ref(false);

watch(selectedCli, (cli, oldCli) => {
  setAiDefaultCli(cli);
  if (!restoringThread.value) {
    selectedModel.value = cli === 'claude'
      ? settings.value.ai.defaultModelClaude
      : settings.value.ai.defaultModelCodex;
    selectedEffort.value = cli === 'claude'
      ? settings.value.ai.effortClaude
      : settings.value.ai.effortCodex;
  }
  aiContext.reset(cli);
  if (oldCli && oldCli !== cli && !restoringThread.value) {
    ai.startNewThread();
    session.startNew();
  }
});

watch(selectedModel, (m) => {
  if (selectedCli.value === 'claude') setAiDefaultModelClaude(m);
  else setAiDefaultModelCodex(m);
});

watch(selectedEffort, (e) => {
  if (selectedCli.value === 'claude') setAiEffortClaude(e);
  else setAiEffortCodex(e);
});

onMounted(async () => {
  layout.mount();
  ai.bindDoc(props.docPath || '');
  if (props.docPath) {
    await Promise.all([
      session.loadFor(props.docPath),
      access.loadFor(props.docPath),
      health.checkAll().catch(() => {}),
    ]);
  } else {
    health.checkAll().catch(() => {});
  }
});

onUnmounted(() => {
  layout.unmount();
});

watch(() => props.docPath, async (p) => {
  ai.bindDoc(p || '');
  if (p) {
    await session.loadFor(p);
    await access.loadFor(p);
  }
});

function buildPreambleForSend(): string {
  const localeKey = (typeof navigator !== 'undefined' && (localStorage.getItem('mermark-locale') ?? 'en')) || 'en';
  return buildPreamble({
    pins: pins.includePinned.value
      ? pins.pinnedSelections.value.map(p => ({ id: p.id, text: p.text }))
      : [],
    includePins: pins.includePinned.value,
    selectionRange: props.selectionRange,
    accessMap: access.current.value,
    docPath: props.docPath,
    docNeedsSave: docNeedsSave.value,
    docTooLarge: docTooLarge.value,
    sendFullDocOverride: sendFullDocOverride.value,
    docMarkdownLength: docMarkdown.value.length,
    localeKey,
  });
}

async function onSend() {
  if (!inputValue.value.trim() || !access.current.value) return;

  if (pins.pinnedSelections.value.length === 0 && liveSelectionText.value) {
    pins.pinCurrentSelection();
  }

  const sentPins = (pins.includePinned.value && pins.pinnedSelections.value.length > 0)
    ? pins.pinnedSelections.value.map(p => ({ id: p.id, text: p.text }))
    : [];

  const prompt = inputValue.value;
  inputValue.value = '';

  let imagePaths: string[] = [];
  try {
    imagePaths = await images.persistPendingImagesForSend();
  } catch (e) {
    console.error('[AiPanel] persisting images failed:', e);
    window.alert(`Image upload failed: ${(e as Error)?.message ?? e}`);
    return;
  }
  // Detach images from the composer strip and hand the blob URLs to the chat
  // history so user sees thumbnails of what was sent. Don't revoke — chat now
  // owns these URLs.
  const sentImages = images.detachForChat();

  if (sentPins.length > 0 || sentImages.length > 0) {
    ai.pushAttachment({ pins: sentPins, images: sentImages });
  }

  if (!docNeedsSave.value) {
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const onDiskBefore = await readTextFile(props.docPath);
      await aiCommands.snapshotCreate(
        props.docPath,
        onDiskBefore,
        (session.current.value && session.current.value.cli === selectedCli.value ? session.current.value.sessionId : null),
        settings.value.ai.snapshotsKeep,
      );
    } catch (e) {
      console.warn('[AiPanel] pre-send snapshot failed (continuing anyway):', e);
    }
  }

  await ai.send({
    cli: selectedCli.value,
    sessionId: (session.current.value && session.current.value.cli === selectedCli.value ? session.current.value.sessionId : null),
    model: selectedModel.value,
    effort: selectedEffort.value,
    prompt,
    preamble: buildPreambleForSend(),
    accessMap: access.current.value,
    workDir: props.workDir,
    images: imagePaths,
    onSessionId: async (sid) => {
      await session.persistFromResponse({
        docPath: props.docPath,
        cli: selectedCli.value,
        sessionId: sid,
        docContent: docMarkdown.value,
      });
    },
    onToolRequest: (tool) => {
      toolToast.trigger(tool);
    },
  });
}

async function onCancel() { await ai.cancel(); }

async function revertLastSnapshot() {
  try {
    const items = await aiCommands.snapshotList(props.docPath);
    if (items.length === 0) {
      window.alert('No snapshots to revert to.');
      return;
    }
    const sorted = [...items].sort((a, b) => b.ts.localeCompare(a.ts));
    const latest = sorted[0];
    const ok = window.confirm(`Revert to snapshot from ${latest.ts}?`);
    if (!ok) return;
    const content = await aiCommands.snapshotRestore(props.docPath, latest.id);
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(props.docPath, content);
    emit('applyContent', content);
  } catch (e) {
    console.error('[AiPanel] revert failed:', e);
    window.alert(`Revert failed: ${(e as Error).message}`);
  }
}

async function onSnapshotRestored(content: string) {
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(props.docPath, content);
    emit('applyContent', content);
  } catch (e) {
    console.error('[AiPanel] snapshot restore write failed:', e);
    window.alert(`Restore failed: ${(e as Error).message}`);
  }
}

function newChat() {
  ai.startNewThread();
  session.startNew();
  aiContext.reset(selectedCli.value);
}

async function onSelectThread(id: string) {
  ai.selectThread(id);
  // Restore CLI / model / effort from the thread so the user picks up where
  // they left off. Fall back to current selection when fields are missing
  // (legacy thread that pre-dates per-thread model persistence).
  const thread = ai.threads.value.find(x => x.id === id);
  restoringThread.value = true;
  if (thread?.cli && thread.cli !== selectedCli.value) {
    selectedCli.value = thread.cli;
  }
  if (thread?.model) {
    selectedModel.value = thread.model;
  }
  if (thread?.effort) {
    selectedEffort.value = thread.effort;
  }
  // Wait for the CLI/model/effort watchers to flush before lifting the guard,
  // otherwise the CLI watcher would see restoringThread === false and clobber
  // model/effort with the per-CLI defaults.
  await nextTick();
  restoringThread.value = false;
  aiContext.reset(selectedCli.value);
}

function onDeleteThread(id: string) {
  ai.deleteThread(id);
}

function onPickImage() {
  void images.pickImageFile();
}

function onPreviewImage(img: PendingImage) {
  images.previewedImage.value = img;
}
</script>

<template>
  <AiPanelTab
    v-if="props.open && settings.ai.enabled && layout.minimized.value"
    :side="settings.ai.panelSide"
    :style="layout.minimizedStyle.value"
    @restore="layout.minimized.value = false"
  />

  <aside
    v-if="props.open && settings.ai.enabled && !layout.minimized.value"
    class="ai-panel"
    :class="{ 'ai-panel--fullscreen': layout.fullscreen.value, 'ai-panel--left': settings.ai.panelSide === 'left' && !layout.fullscreen.value }"
    :style="layout.sideStyle.value"
  >
    <AiPanelHeader
      :cli="selectedCli"
      :available-clis="availableClis"
      :model="selectedModel"
      :model-options="modelOptions"
      :effort="selectedEffort"
      :effort-options="effortOptions"
      :custom-model-input="customModelInput"
      :is-custom-model="isCustomModel"
      :cli-connected="cliConnected"
      :cli-account="health.cache.value[selectedCli]?.account ?? ''"
      :threads="ai.threads.value"
      :active-thread-id="ai.activeThreadId.value"
      :fullscreen="layout.fullscreen.value"
      :title-text="t.aiPanelTitle"
      :status-ok-label="t.aiStatusOk"
      :status-auth-label="t.aiStatusAuthRequired"
      :model-title="t.aiModel"
      :default-cli-title="t.aiDefaultCli"
      :fullscreen-title="t.aiFullscreen"
      :exit-fullscreen-title="t.aiExitFullscreen"
      :close-title="t.aiClose"
      :new-chat-title="t.aiNewChat"
      @update:cli="(v) => selectedCli = v"
      @update:model="(v) => selectedModel = v"
      @update:effort="(v) => selectedEffort = v"
      @update:custom-model-input="(v) => customModelInput = v"
      @minimize="layout.minimized.value = true"
      @toggle-fullscreen="layout.fullscreen.value = !layout.fullscreen.value"
      @close="emit('close')"
      @revert="revertLastSnapshot"
      @new-chat="newChat"
      @select-thread="onSelectThread"
      @delete-thread="onDeleteThread"
      @threads-ref="(el) => layout.setThreadsDetails(el)"
    />

    <AiPanelContextBar :usage="aiContext.usage.value" :usage-label="aiContext.usageLabel.value" />

    <AiPanelStatusNotices :connecting="anyHealthLoading" :unsaved="docNeedsSave" />

    <AiPanelMessages
      :messages="ai.messages.value"
      :is-sending="ai.isSending.value"
      :empty-hint="t.aiEmptyHint"
      :empty-key-hint="t.aiEmptyKeyHint"
      :cli-connected="cliConnected"
      :auth-required-hint="t.aiStatusAuthRequired"
      :connecting="anyHealthLoading"
      @link-click="(url) => emit('linkClick', url)"
      @show-attachment="(p) => pins.openAttachment(p)"
    />

    <AiPanelComposer
      :input-value="inputValue"
      :cli-connected="cliConnected"
      :is-sending="ai.isSending.value"
      :auth-required-hint="t.aiStatusAuthRequired"
      :empty-key-hint="t.aiEmptyKeyHint"
      :send-button-text="t.aiSendButton"
      :cancel-button-text="t.aiCancelButton"
      :access-map-title="t.aiAccessMapTitle"
      :doc-path="props.docPath"
      :doc-too-large="docTooLarge"
      :doc-markdown-length-kb="Math.round(docMarkdown.length / 1024)"
      :send-full-doc-override="sendFullDocOverride"
      :pinned-selections="pins.pinnedSelections.value"
      :include-pinned="pins.includePinned.value"
      :show-live-selection="pins.showLiveSelection.value"
      :live-selection-text="liveSelectionText"
      :pin-preview="pins.previewOf"
      :pending-images="images.pendingImages.value"
      :access-map="access.current.value"
      @update:input-value="(v) => inputValue = v"
      @update:send-full-doc-override="(v) => sendFullDocOverride = v"
      @update:include-pinned="(v) => pins.includePinned.value = v"
      @update:access-map="(v) => access.save(v)"
      @send="onSend"
      @cancel="onCancel"
      @paste="(e) => images.onComposerPaste(e)"
      @pick-image="onPickImage"
      @pin="pins.pinCurrentSelection"
      @remove-pin="(id) => pins.removePin(id)"
      @clear-pins="pins.clearAllPins"
      @preview-image="onPreviewImage"
      @remove-image="(id) => images.removePendingImage(id)"
      @clear-images="images.clearPendingImages"
      @snapshot-restored="onSnapshotRestored"
    />

    <AiToolToast :tool="toolToast.toolActivity.value" />

    <AiAttachmentModal
      v-if="pins.attachmentModal.value"
      :pins="pins.attachmentModal.value"
      @close="pins.closeAttachment"
    />

    <AiImagePreview
      v-if="images.previewedImage.value"
      :src="images.previewedImage.value.blobUrl"
      :name="images.previewedImage.value.name"
      @close="images.previewedImage.value = null"
    />
  </aside>
</template>

<style scoped>
.ai-panel {
  position: fixed;
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
</style>
