<script setup lang="ts">
import type { PinnedItem } from '../../composables/useAiPinnedSelections';

const props = defineProps<{
  pins: PinnedItem[];
  includePinned: boolean;
  showLive: boolean;
  liveText: string | null;
  preview: (text: string, max?: number) => string;
}>();

const emit = defineEmits<{
  'update:includePinned': [value: boolean];
  pin: [];
  remove: [id: string];
  clearAll: [];
}>();

function previewOf(text: string): string {
  return props.preview(text, 100);
}

function onToggle(e: Event) {
  emit('update:includePinned', (e.target as HTMLInputElement).checked);
}
</script>

<template>
  <div v-if="pins.length > 0 || showLive" class="ai-panel__pinned">
    <div class="ai-panel__pinned-head">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17v5"/><path d="M9 10.76A2 2 0 0 1 8 9V3h8v6a2 2 0 0 1-1 1.76l-1 .58a2 2 0 0 0-1 1.76V17H10v-3.93a2 2 0 0 0-1-1.74l-1-.57z"/></svg>
      <span class="ai-panel__pinned-label">
        {{ pins.length > 0 ? `${pins.length} pinned` : 'Selection (not pinned)' }}
      </span>
      <label v-if="pins.length > 0" class="ai-panel__pinned-toggle">
        <input type="checkbox" :checked="includePinned" @change="onToggle" />
        <span>Send</span>
      </label>
      <button v-if="showLive" class="ai-panel__pinned-action" @click="emit('pin')">+ Pin</button>
      <button v-if="pins.length > 0" class="ai-panel__pinned-action ai-panel__pinned-action--clear" @click="emit('clearAll')" title="Clear all pinned selections">Clear all</button>
    </div>
    <ul v-if="pins.length > 0" class="ai-panel__pin-list">
      <li v-for="(p, i) in pins" :key="p.id" class="ai-panel__pin-item">
        <span class="ai-panel__pin-num">#{{ i + 1 }}</span>
        <span class="ai-panel__pin-text" :title="p.text">{{ previewOf(p.text) }}</span>
        <button class="ai-panel__pin-rm" @click="emit('remove', p.id)" title="Remove this pin">×</button>
      </li>
    </ul>
    <div v-if="showLive" class="ai-panel__pin-live">
      <span class="ai-panel__pin-live-label">Live selection (click + Pin to attach)</span>
      <pre class="ai-panel__pinned-preview ai-panel__pinned-preview--live">{{ liveText }}</pre>
    </div>
  </div>
</template>

<style scoped>
.ai-panel__pinned {
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  font-size: 12px;
}
.ai-panel__pinned-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--text-secondary, var(--text-muted));
}
.ai-panel__pinned-label {
  font-weight: 600;
  color: var(--text-primary);
}
.ai-panel__pinned-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  font-size: 11px;
  cursor: pointer;
}
.ai-panel__pinned-action {
  padding: 2px 10px;
  font-size: 11px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  margin-left: auto;
}
.ai-panel__pinned-action:hover { filter: brightness(1.1); }
.ai-panel__pinned-preview {
  background: var(--bg-tertiary);
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--code-font-family, monospace);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 160px;
  overflow-y: auto;
  color: var(--text-primary);
  border-left: 3px solid var(--primary);
}
.ai-panel__pinned-action--clear {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}
.ai-panel__pinned-action--clear:hover {
  background: var(--danger);
  color: #fff;
  filter: none;
}
.ai-panel__pin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 200px;
  overflow-y: auto;
}
.ai-panel__pin-item {
  display: grid;
  grid-template-columns: 26px 1fr auto;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  background: var(--bg-tertiary);
  border-radius: 4px;
  font-size: 11px;
  border-left: 3px solid var(--primary);
}
.ai-panel__pin-num {
  font-weight: 700;
  color: var(--primary);
  font-family: var(--code-font-family, monospace);
}
.ai-panel__pin-text {
  font-family: var(--code-font-family, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.ai-panel__pin-rm {
  background: transparent;
  border: none;
  color: var(--text-faint);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 3px;
}
.ai-panel__pin-rm:hover { color: var(--danger); background: var(--hover-bg); }

.ai-panel__pin-live {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed var(--border-primary);
}
.ai-panel__pin-live-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
  margin-bottom: 4px;
}
.ai-panel__pinned-preview--live {
  border-left-color: var(--text-faint);
  border-left-style: dashed;
}
</style>
