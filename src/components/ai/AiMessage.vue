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
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  max-width: 100%;
}
.ai-msg--user { background: var(--ai-user-bg, #eef2ff); }
.ai-msg--assistant { background: var(--ai-assistant-bg, #f8fafc); }
.ai-msg--err { border: 1px solid #ef4444; }
.ai-msg__text {
  white-space: pre-wrap;
  margin: 0;
  font-family: inherit;
  font-size: 13px;
}
.ai-msg__error { color: #ef4444; font-size: 12px; margin-top: 4px; }
.ai-msg__actions { display: flex; gap: 6px; margin-top: 6px; }
</style>
