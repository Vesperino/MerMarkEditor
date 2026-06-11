<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../../i18n';
import { contextWarnLevel, type ContextUsage } from '../../composables/useAiContext';

const props = defineProps<{
  usage: ContextUsage;
  usageLabel: string;
}>();

const { t } = useI18n();

const warnLevel = computed(() => contextWarnLevel(props.usage.fraction));
// Under pressure the per-category palette collapses into a single amber/red
// fill so the bar itself reads as the warning.
const fillOverride = computed<string | null>(() => {
  if (warnLevel.value === 'danger') return 'var(--danger, #dc2626)';
  if (warnLevel.value === 'warn') return '#f59e0b';
  return null;
});
</script>

<template>
  <div v-if="!usage.empty" class="ai-panel__context">
    <details class="ai-panel__context-details">
      <summary class="ai-panel__context-summary">
        <div class="ai-panel__context-bar">
          <div
            v-for="seg in usage.breakdown.filter(b => b.key !== 'free')"
            :key="seg.key"
            class="ai-panel__context-seg"
            :style="{ width: seg.pct + '%', background: fillOverride ?? seg.color }"
            :title="`${seg.label}: ${seg.tokens.toLocaleString()} (${seg.pct.toFixed(1)}%)`"
          />
        </div>
        <span class="ai-panel__context-label">{{ usageLabel }}</span>
      </summary>
      <ul class="ai-panel__context-breakdown">
        <li v-for="seg in usage.breakdown" :key="seg.key">
          <span class="ai-panel__context-dot" :style="{ background: seg.color }" />
          <span class="ai-panel__context-name">{{ seg.label }}</span>
          <span class="ai-panel__context-num">{{ seg.tokens.toLocaleString() }}</span>
          <span class="ai-panel__context-pct">{{ seg.pct.toFixed(1) }}%</span>
        </li>
        <li v-if="usage.outputTokens > 0" class="ai-panel__context-extra">
          <span class="ai-panel__context-name">Output (this turn)</span>
          <span class="ai-panel__context-num">{{ usage.outputTokens.toLocaleString() }}</span>
        </li>
      </ul>
    </details>
    <div
      v-if="warnLevel !== 'none'"
      class="ai-panel__context-warning"
      :class="{ 'ai-panel__context-warning--danger': warnLevel === 'danger' }"
    >
      {{ t.aiContextNearlyFull }}
    </div>
  </div>
</template>

<style scoped>
.ai-panel__context {
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  font-size: 11px;
  color: var(--text-muted);
}
.ai-panel__context-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  cursor: pointer;
  list-style: none;
}
.ai-panel__context-summary::-webkit-details-marker { display: none; }
.ai-panel__context-seg {
  height: 100%;
  transition: width 220ms ease;
}
.ai-panel__context-breakdown {
  list-style: none;
  margin: 0;
  padding: 4px 12px 10px 12px;
  display: grid;
  gap: 4px;
  background: var(--bg-tertiary);
}
.ai-panel__context-breakdown li {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 8px;
  align-items: center;
  font-size: 11px;
}
.ai-panel__context-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ai-panel__context-num {
  font-family: var(--code-font-family, monospace);
  color: var(--text-secondary, var(--text-primary));
}
.ai-panel__context-pct {
  font-family: var(--code-font-family, monospace);
  color: var(--text-muted);
  min-width: 42px;
  text-align: right;
}
.ai-panel__context-extra .ai-panel__context-name {
  grid-column: 2;
  opacity: 0.7;
  font-style: italic;
}
.ai-panel__context-bar {
  flex: 1;
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}
.ai-panel__context-fill {
  height: 100%;
  background: var(--primary);
  transition: width 220ms ease;
}
.ai-panel__context-fill.ai-panel__context-fill--warn {
  background: var(--danger);
}
.ai-panel__context-label {
  font-family: var(--code-font-family, monospace);
  white-space: nowrap;
  cursor: help;
}
.ai-panel__context-warning {
  padding: 4px 12px 6px;
  font-size: 11px;
  color: #b45309;
}
.ai-panel__context-warning--danger {
  color: var(--danger, #dc2626);
}
</style>
