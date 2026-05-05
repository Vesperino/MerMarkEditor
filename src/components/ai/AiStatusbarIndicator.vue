<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAi } from '../../composables/useAi';
import { useAiHealth } from '../../composables/useAiHealth';
import { useSettings } from '../../composables/useSettings';

const { settings } = useSettings();
const { check, cache } = useAiHealth();
const { bypassEnabled } = useAi();

onMounted(() => {
  if (settings.value.ai.enabled) {
    check('claude').catch(() => {});
    check('codex').catch(() => {});
  }
});

const dotClass = computed(() => {
  if (bypassEnabled.value) return 'ai-status-dot ai-status-dot--bypass';
  const c = cache.value.claude;
  const x = cache.value.codex;
  const anyOk = (c?.ok || x?.ok);
  if (anyOk) return 'ai-status-dot ai-status-dot--ok';
  if (c === null && x === null) return 'ai-status-dot ai-status-dot--unknown';
  return 'ai-status-dot ai-status-dot--err';
});
</script>

<template>
  <div v-if="settings.ai.enabled" class="ai-status-indicator" title="AI">
    <span :class="dotClass" />
    <span class="ai-status-label">AI</span>
  </div>
</template>

<style scoped>
.ai-status-indicator { display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; }
.ai-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.ai-status-dot--ok { background: #22c55e; }
.ai-status-dot--err { background: #ef4444; }
.ai-status-dot--unknown { background: #94a3b8; }
.ai-status-dot--bypass { background: #ef4444; animation: ai-blink 1s linear infinite; }
.ai-status-label { font-size: 11px; opacity: .8; }
@keyframes ai-blink { 50% { opacity: .3; } }
</style>
