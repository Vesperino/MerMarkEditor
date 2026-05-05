<script setup lang="ts">
import { useI18n } from '../../i18n';

const { t } = useI18n();

defineProps<{
  pins: Array<{ id: string; text: string }>;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="ai-attach-modal" @click.self="$emit('close')">
    <div class="ai-attach-modal__panel">
      <header class="ai-attach-modal__head">
        <strong>{{ t.aiAttachmentCount(pins.length) }}</strong>
        <button @click="$emit('close')" class="ai-attach-modal__close" :title="t.aiClose">×</button>
      </header>
      <div class="ai-attach-modal__body">
        <div v-for="(p, i) in pins" :key="p.id" class="ai-attach-modal__item">
          <div class="ai-attach-modal__item-head">#{{ i + 1 }}</div>
          <pre class="ai-attach-modal__item-text">{{ p.text }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-attach-modal {
  position: fixed;
  inset: 0;
  background: var(--overlay-bg, rgba(0,0,0,0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.ai-attach-modal__panel {
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  width: min(640px, 92vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.ai-attach-modal__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
}
.ai-attach-modal__head strong { flex: 1; }
.ai-attach-modal__close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0 6px;
  border-radius: 4px;
}
.ai-attach-modal__close:hover { background: var(--hover-bg); color: var(--text-primary); }
.ai-attach-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ai-attach-modal__item {
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  overflow: hidden;
}
.ai-attach-modal__item-head {
  background: var(--bg-tertiary);
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--primary);
  font-family: var(--code-font-family, monospace);
}
.ai-attach-modal__item-text {
  margin: 0;
  padding: 10px;
  background: var(--bg-secondary);
  font-size: 12px;
  font-family: var(--code-font-family, monospace);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
}
</style>
