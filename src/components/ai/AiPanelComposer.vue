<script setup lang="ts">
import AiPanelPinList from './AiPanelPinList.vue';
import AiPanelImageStrip from './AiPanelImageStrip.vue';
import AiAccessMapEditor from './AiAccessMapEditor.vue';
import AiSnapshotList from './AiSnapshotList.vue';
import type { PendingImage } from '../../composables/useAiPendingImages';
import type { PinnedItem } from '../../composables/useAiPinnedSelections';
import type { AccessMap } from '../../services/aiCommands';

defineProps<{
  inputValue: string;
  cliConnected: boolean;
  isSending: boolean;
  authRequiredHint: string;
  emptyKeyHint: string;
  sendButtonText: string;
  cancelButtonText: string;
  accessMapTitle: string;
  docPath: string;

  docTooLarge: boolean;
  docMarkdownLengthKb: number;
  sendFullDocOverride: boolean;

  pinnedSelections: PinnedItem[];
  includePinned: boolean;
  showLiveSelection: boolean;
  liveSelectionText: string | null;
  pinPreview: (text: string, max?: number) => string;

  pendingImages: PendingImage[];

  accessMap: AccessMap | null;
}>();

const emit = defineEmits<{
  'update:inputValue': [value: string];
  'update:sendFullDocOverride': [value: boolean];
  'update:includePinned': [value: boolean];
  'update:accessMap': [value: AccessMap];

  send: [];
  cancel: [];
  paste: [e: ClipboardEvent];
  pickImage: [];

  pin: [];
  removePin: [id: string];
  clearPins: [];

  previewImage: [img: PendingImage];
  removeImage: [id: string];
  clearImages: [];

  snapshotRestored: [content: string];
}>();

function onInput(e: Event) {
  emit('update:inputValue', (e.target as HTMLTextAreaElement).value);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    emit('send');
  }
}

function onOverrideToggle(e: Event) {
  emit('update:sendFullDocOverride', (e.target as HTMLInputElement).checked);
}
</script>

<template>
  <footer class="ai-panel__composer">
    <div v-if="docTooLarge" class="ai-panel__warn">
      Document is large ({{ docMarkdownLengthKb }} KB).
      <label><input type="checkbox" :checked="sendFullDocOverride" @change="onOverrideToggle" /> Send full document</label>
    </div>

    <AiPanelPinList
      :pins="pinnedSelections"
      :include-pinned="includePinned"
      :show-live="showLiveSelection"
      :live-text="liveSelectionText"
      :preview="pinPreview"
      @update:include-pinned="(v) => emit('update:includePinned', v)"
      @pin="emit('pin')"
      @remove="(id) => emit('removePin', id)"
      @clear-all="emit('clearPins')"
    />

    <AiPanelImageStrip
      :images="pendingImages"
      @preview="(img) => emit('previewImage', img)"
      @remove="(id) => emit('removeImage', id)"
      @clear="emit('clearImages')"
    />

    <textarea
      :value="inputValue"
      @input="onInput"
      class="ai-panel__input"
      :placeholder="cliConnected ? 'Type a message… (paste images with Ctrl+V)' : authRequiredHint"
      :disabled="!cliConnected"
      rows="3"
      @keydown="onKeydown"
      @paste="(e) => emit('paste', e)"
    />

    <div class="ai-panel__composer-actions">
      <button class="ai-panel__btn ai-panel__btn--icon" @click="emit('pickImage')" :disabled="!cliConnected" title="Attach image">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      </button>
      <span class="ai-panel__hint">{{ emptyKeyHint }}</span>
      <button v-if="isSending" class="ai-panel__btn ai-panel__btn--secondary" @click="emit('cancel')">{{ cancelButtonText }}</button>
      <button v-else class="ai-panel__btn ai-panel__btn--primary" @click="emit('send')" :disabled="!inputValue.trim() || !cliConnected">{{ sendButtonText }}</button>
    </div>

    <details class="ai-panel__details">
      <summary>{{ accessMapTitle }}</summary>
      <AiAccessMapEditor
        v-if="accessMap"
        :model-value="accessMap"
        @update:model-value="(v) => emit('update:accessMap', v)"
      />
    </details>

    <AiSnapshotList :doc-path="docPath" @restored="(c) => emit('snapshotRestored', c)" />
  </footer>
</template>

<style scoped>
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

.ai-panel__btn--icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}
.ai-panel__btn--icon:hover { background: var(--hover-bg); color: var(--text-primary); }
.ai-panel__btn--icon:disabled { opacity: 0.5; cursor: not-allowed; }

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
