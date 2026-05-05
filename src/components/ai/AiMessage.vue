<script setup lang="ts">
import { computed } from 'vue';
import type { AiMessage } from '../../composables/useAi';

const props = defineProps<{
  message: AiMessage;
  hasFence: boolean;
}>();

const isTool = computed(() => props.message.role === 'tool');
const isAssistant = computed(() => props.message.role === 'assistant');
// Show typing indicator while waiting for first text chunk.
const isThinking = computed(
  () => isAssistant.value && !props.message.done && props.message.text === '' && !props.message.error
);

// Strip mermark-replace / mermark-patch fence blocks from the visible bubble
// (defensive: if AI still returns a fence, strip it so the bubble stays clean).
const FENCE_RE = /```mermark-(replace|patch)\n[\s\S]*?```\s*/g;
const visibleText = computed(() => {
  const t = props.message.text;
  if (!props.hasFence) return t;
  return t.replace(FENCE_RE, '').trim();
});
</script>

<template>
  <div v-if="isTool" class="ai-msg ai-msg--tool">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    <span class="ai-msg__tool-label">{{ message.tool }}</span>
    <span class="ai-msg__tool-args" :title="message.text">{{ message.text }}</span>
  </div>
  <div
    v-else
    class="ai-msg"
    :class="{
      'ai-msg--user': !isAssistant,
      'ai-msg--assistant': isAssistant,
      'ai-msg--err': !!message.error,
    }"
  >
    <div v-if="isThinking" class="ai-msg__thinking" aria-label="Thinking">
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-text">Thinking…</span>
    </div>
    <pre v-else class="ai-msg__text">{{ visibleText }}</pre>
    <div v-if="message.error" class="ai-msg__error">{{ message.error }}</div>
  </div>
</template>

<style scoped>
.ai-msg {
  padding: 10px 14px;
  border-radius: 8px;
  max-width: 100%;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}
.ai-msg--user {
  background: var(--active-bg);
  color: var(--active-text);
  align-self: flex-end;
  max-width: 88%;
}
.ai-msg--assistant {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  align-self: flex-start;
  max-width: 92%;
  border: 1px solid var(--border-primary);
}
.ai-msg--err {
  background: var(--error-bg, rgba(239, 68, 68, 0.08));
  color: var(--error-color, #dc2626);
  border: 1px solid var(--error-border, rgba(239, 68, 68, 0.3));
}
.ai-msg__text {
  white-space: pre-wrap;
  margin: 0;
  font-family: inherit;
}
.ai-msg__error { font-size: 12px; margin-top: 6px; }

/* Typing indicator while waiting for first chunk */
.ai-msg__thinking {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-msg__thinking-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: ai-msg-bounce 1.2s infinite ease-in-out both;
}
.ai-msg__thinking-dot:nth-child(1) { animation-delay: 0s; }
.ai-msg__thinking-dot:nth-child(2) { animation-delay: 0.15s; }
.ai-msg__thinking-dot:nth-child(3) { animation-delay: 0.3s; }
.ai-msg__thinking-text {
  margin-left: 4px;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
@keyframes ai-msg-bounce {
  0%, 80%, 100% { opacity: .3; transform: scale(0.7); }
  40% { opacity: 1; transform: scale(1); }
}

/* Tool usage entry */
.ai-msg--tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px dashed var(--border-primary);
  font-family: var(--code-font-family, monospace);
  max-width: 100%;
}
.ai-msg__tool-label { font-weight: 600; color: var(--primary); }
.ai-msg__tool-args {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  opacity: 0.75;
}
</style>
