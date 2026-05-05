<script setup lang="ts">
defineProps<{
  connecting: boolean;
  unsaved: boolean;
}>();
</script>

<template>
  <div v-if="connecting" class="ai-panel__connecting">
    <span class="ai-panel__spinner" aria-hidden="true" />
    <span>Connecting to AI CLI…</span>
  </div>

  <div v-if="unsaved" class="ai-panel__unsaved">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    <div class="ai-panel__unsaved-body">
      <strong>Document not saved yet</strong>
      <span>AI can still answer questions, but file edits and snapshots need a saved path.</span>
    </div>
  </div>
</template>

<style scoped>
.ai-panel__connecting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-primary);
  color: var(--text-muted);
  font-size: 12px;
}
.ai-panel__spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border-primary);
  border-top-color: var(--primary);
  animation: ai-spin 0.8s linear infinite;
}
@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

.ai-panel__unsaved {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: var(--diff-removed-bg, #fef3c7);
  color: var(--split-toggle-color, #b45309);
  font-size: 12px;
  border-bottom: 1px solid var(--border-primary);
}
.ai-panel__unsaved svg { flex-shrink: 0; margin-top: 1px; }
.ai-panel__unsaved-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ai-panel__unsaved-body strong { font-weight: 600; }
</style>
