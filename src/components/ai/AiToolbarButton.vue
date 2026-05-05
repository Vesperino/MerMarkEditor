<script setup lang="ts">
import { useI18n } from '../../i18n';

defineProps<{ active: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();
</script>

<template>
  <button
    class="ai-toolbar-btn"
    :class="{ 'ai-toolbar-btn--active': active }"
    :title="t.aiToggleTooltip"
    :aria-label="t.aiToggleTooltip"
    @click="emit('toggle')"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v1H7a4 4 0 0 0-4 4v3a4 4 0 0 0 2 3.46V20a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.54A4 4 0 0 0 21 13v-3a4 4 0 0 0-4-4h-2V5a3 3 0 0 0-3-3z"/>
      <circle cx="9" cy="13" r="1"/>
      <circle cx="15" cy="13" r="1"/>
    </svg>
    <span class="ai-toolbar-btn__label">AI</span>
  </button>
</template>

<style scoped>
.ai-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 120ms ease;
}
.ai-toolbar-btn:hover {
  background: var(--hover-bg);
  border-color: var(--border-secondary);
}
.ai-toolbar-btn--active {
  background: var(--active-bg);
  color: var(--active-text);
  border-color: var(--active-border);
}
.ai-toolbar-btn__label {
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
