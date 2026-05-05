<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import AiMessage from './AiMessage.vue';
import { useI18n } from '../../i18n';
import { parseAiOutput } from '../../composables/useAiOutputParser';
import type { AiMessage as AiMessageType, AttachedPin } from '../../composables/useAi';

const { t } = useI18n();

const props = defineProps<{
  messages: AiMessageType[];
  isSending: boolean;
  emptyHint: string;
  emptyKeyHint: string;
  cliConnected: boolean;
  authRequiredHint: string;
  connecting: boolean;
}>();

defineEmits<{
  linkClick: [url: string];
  showAttachment: [pins: AttachedPin[]];
}>();

const messagesEl = ref<HTMLElement | null>(null);

watch(() => props.messages.length, async () => {
  await nextTick();
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
});

function messageHasFence(text: string): boolean {
  return parseAiOutput(text).kind !== 'plain';
}
</script>

<template>
  <div ref="messagesEl" class="ai-panel__messages">
    <div v-if="messages.length === 0 && !connecting" class="ai-panel__empty">
      <p>{{ cliConnected ? emptyHint : authRequiredHint }}</p>
      <p class="ai-panel__empty-hint">{{ emptyKeyHint }}</p>
    </div>
    <AiMessage
      v-for="(m, i) in messages"
      :key="i"
      :message="m"
      :has-fence="m.role === 'assistant' && m.done && messageHasFence(m.text)"
      @link-click="(url: string) => $emit('linkClick', url)"
      @show-attachment="(pins) => $emit('showAttachment', pins)"
    />
    <div v-if="isSending" class="ai-panel__processing">
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span class="ai-msg__thinking-dot" />
      <span>{{ t.aiWorkingPlease }}</span>
    </div>
  </div>
</template>

<style scoped>
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
.ai-panel__processing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border-radius: 999px;
  font-size: 11px;
  color: var(--text-muted);
  font-style: italic;
}
.ai-panel__processing > span:first-child,
.ai-panel__processing > span:nth-child(2),
.ai-panel__processing > span:nth-child(3) {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: ai-msg-bounce 1.2s infinite ease-in-out both;
}
.ai-panel__processing > span:nth-child(1) { animation-delay: 0s; }
.ai-panel__processing > span:nth-child(2) { animation-delay: 0.15s; }
.ai-panel__processing > span:nth-child(3) { animation-delay: 0.3s; }
@keyframes ai-msg-bounce {
  0%, 80%, 100% { opacity: .3; transform: scale(0.7); }
  40% { opacity: 1; transform: scale(1); }
}
</style>
