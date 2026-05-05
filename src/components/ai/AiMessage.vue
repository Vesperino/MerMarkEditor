<script setup lang="ts">
import { computed } from 'vue';
import type { AiMessage } from '../../composables/useAi';

const props = defineProps<{
  message: AiMessage;
  hasFence: boolean;
}>();

const emit = defineEmits<{
  showDiff: [];
  apply: [];
  reject: [];
}>();

const isAssistant = computed(() => props.message.role === 'assistant');
// Show typing indicator while waiting for first text chunk.
const isThinking = computed(
  () => isAssistant.value && !props.message.done && props.message.text === '' && !props.message.error
);

// Strip mermark-replace / mermark-patch fence blocks from the visible bubble
// (they are huge and noisy; the action buttons handle them).
const FENCE_RE = /```mermark-(replace|patch)\n[\s\S]*?```\s*/g;
const visibleText = computed(() => {
  const t = props.message.text;
  if (!props.hasFence) return t;
  return t.replace(FENCE_RE, '').trim();
});

// Detect whether the AI proposed a patch vs full replace, for the badge.
const fenceKind = computed<'patch' | 'replace' | null>(() => {
  if (!props.hasFence) return null;
  if (/```mermark-replace/.test(props.message.text)) return 'replace';
  if (/```mermark-patch/.test(props.message.text)) return 'patch';
  return null;
});
</script>

<template>
  <div
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
    <div v-if="isAssistant && message.done && hasFence" class="ai-msg__proposal">
      <div class="ai-msg__proposal-header">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
        <span>AI proposes a {{ fenceKind === 'patch' ? 'patch' : 'replacement' }}</span>
      </div>
      <div class="ai-msg__actions">
        <button class="ai-msg__btn" @click="emit('showDiff')">Show diff</button>
        <button class="ai-msg__btn ai-msg__btn--primary" @click="emit('apply')">Accept</button>
        <button class="ai-msg__btn" @click="emit('reject')">Discard</button>
      </div>
    </div>
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
.ai-msg__proposal {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-primary);
}
.ai-msg__proposal-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ai-msg__actions {
  display: flex;
  gap: 6px;
}
.ai-msg__btn {
  padding: 5px 12px;
  font-size: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.ai-msg__btn:hover { background: var(--hover-bg); }
.ai-msg__btn--primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.ai-msg__btn--primary:hover { background: var(--primary-hover, var(--primary)); filter: brightness(1.1); }

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
</style>
