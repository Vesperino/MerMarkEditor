<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../i18n';
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

const { t } = useI18n();
const isAssistant = computed(() => props.message.role === 'assistant');
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
    <pre class="ai-msg__text">{{ message.text }}</pre>
    <div v-if="message.error" class="ai-msg__error">{{ message.error }}</div>
    <div v-if="isAssistant && message.done && hasFence" class="ai-msg__actions">
      <button @click="emit('showDiff')">Diff</button>
      <button @click="emit('apply')">{{ t.aiTmpRecoveryRestore }}</button>
      <button @click="emit('reject')">{{ t.aiTmpRecoveryDiscard }}</button>
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
.ai-msg__actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-primary);
}
.ai-msg__actions button {
  padding: 4px 10px;
  font-size: 12px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.ai-msg__actions button:hover { background: var(--hover-bg); }
</style>
