<script setup lang="ts">
import { useI18n } from '../../i18n';

defineProps<{ active: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();
</script>

<template>
  <button
    class="toolbar-button ai-toolbar-button"
    :class="{ 'ai-toolbar-button--active': active }"
    :title="t.aiToggleTooltip"
    :aria-label="t.aiToggleTooltip"
    @click="emit('toggle')"
  >
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
    <span>AI</span>
  </button>
</template>

<style scoped>
.ai-toolbar-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ai-toolbar-button--active {
  background: var(--toolbar-active, rgba(0, 120, 215, .15));
  border-color: var(--accent-color, #0078d7);
}
</style>
