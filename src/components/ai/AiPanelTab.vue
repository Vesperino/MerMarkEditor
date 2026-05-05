<script setup lang="ts">
import { useI18n } from '../../i18n';

const { t } = useI18n();

defineProps<{
  side: 'left' | 'right';
  style?: Record<string, string>;
}>();

defineEmits<{
  restore: [];
}>();
</script>

<template>
  <button
    class="ai-panel-tab"
    :class="{ 'ai-panel-tab--left': side === 'left' }"
    :style="style"
    @click="$emit('restore')"
    :title="t.aiRestorePanel"
  >
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="6" width="16" height="14" rx="3"/>
      <circle cx="9" cy="13" r="1.3" fill="currentColor"/>
      <circle cx="15" cy="13" r="1.3" fill="currentColor"/>
      <line x1="9" y1="17" x2="15" y2="17"/>
      <line x1="12" y1="3" x2="12" y2="6"/>
      <circle cx="12" cy="2.5" r="1" fill="currentColor"/>
      <line x1="2" y1="11" x2="4" y2="11"/>
      <line x1="2" y1="14" x2="4" y2="14"/>
      <line x1="20" y1="11" x2="22" y2="11"/>
      <line x1="20" y1="14" x2="22" y2="14"/>
    </svg>
    <span>AI</span>
  </button>
</template>

<style scoped>
.ai-panel-tab {
  position: fixed;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  background: var(--bg-primary);
  color: var(--primary);
  border: 1px solid var(--border-primary);
  border-right: none;
  border-radius: 8px 0 0 8px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  z-index: 100;
  box-shadow: var(--shadow-sm);
  transition: background 100ms ease, transform 100ms ease;
}
.ai-panel-tab svg {
  display: block;
  margin-bottom: 2px;
}
.ai-panel-tab:hover {
  background: var(--hover-bg);
  transform: translateX(-2px);
}
.ai-panel-tab--left {
  border-right: 1px solid var(--border-primary);
  border-left: none;
  border-radius: 0 8px 8px 0;
}
.ai-panel-tab--left:hover { transform: translateX(2px); }
</style>
