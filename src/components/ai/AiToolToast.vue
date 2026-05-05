<script setup lang="ts">
import { useI18n } from '../../i18n';

const { t } = useI18n();

defineProps<{ tool: string | null }>();
</script>

<template>
  <Transition name="ai-tool">
    <div v-if="tool" class="ai-panel__tool-toast">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span>{{ t.aiToolUsed(tool) }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.ai-panel__tool-toast {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 999px;
  font-size: 12px;
  box-shadow: var(--shadow-sm);
  pointer-events: none;
  z-index: 5;
}
.ai-tool-enter-active, .ai-tool-leave-active { transition: opacity 200ms ease, transform 200ms ease; }
.ai-tool-enter-from, .ai-tool-leave-to { opacity: 0; transform: translate(-50%, 8px); }
</style>
