<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../i18n';

const props = defineProps<{
  active: boolean;
  vertical?: boolean;
  expanded?: boolean;
}>();
const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();

// In a vertical (left-bar) toolbar, hide the label unless the bar is in
// expanded mode — keeps the 40 px column from clipping the AI text.
const showLabel = computed(() => !props.vertical || !!props.expanded);
</script>

<template>
  <button
    class="ai-toolbar-btn"
    :class="{
      'ai-toolbar-btn--active': active,
      'ai-toolbar-btn--icon-only': !showLabel,
    }"
    :title="t.aiToggleTooltip"
    :aria-label="t.aiToggleTooltip"
    @click="emit('toggle')"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <!-- Robot head -->
      <rect x="4" y="6" width="16" height="14" rx="3"/>
      <circle cx="9" cy="13" r="1.3" fill="currentColor"/>
      <circle cx="15" cy="13" r="1.3" fill="currentColor"/>
      <line x1="9" y1="17" x2="15" y2="17"/>
      <!-- Antenna -->
      <line x1="12" y1="3" x2="12" y2="6"/>
      <circle cx="12" cy="2.5" r="1" fill="currentColor"/>
      <!-- Side ears -->
      <line x1="2" y1="11" x2="4" y2="11"/>
      <line x1="2" y1="14" x2="4" y2="14"/>
      <line x1="20" y1="11" x2="22" y2="11"/>
      <line x1="20" y1="14" x2="22" y2="14"/>
    </svg>
    <span v-if="showLabel" class="ai-toolbar-btn__label">AI</span>
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
.ai-toolbar-btn--icon-only {
  padding: 6px 8px;
}
</style>
