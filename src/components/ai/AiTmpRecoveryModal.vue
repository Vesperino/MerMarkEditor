<script setup lang="ts">
import { useI18n } from '../../i18n';

defineProps<{ tmpPath: string; modifiedAt: string }>();
const emit = defineEmits<{ restore: []; discard: []; showDiff: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="modal-overlay">
    <div class="modal">
      <h3>{{ t.aiTmpRecoveryTitle }}</h3>
      <p><code>{{ tmpPath }}</code></p>
      <p>{{ modifiedAt }}</p>
      <div class="actions">
        <button @click="emit('discard')">{{ t.aiTmpRecoveryDiscard }}</button>
        <button @click="emit('showDiff')">{{ t.aiTmpRecoveryShowDiff }}</button>
        <button @click="emit('restore')" class="primary">{{ t.aiTmpRecoveryRestore }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.modal {
  background: var(--popover-bg, #fff);
  border-radius: 8px;
  padding: 16px;
  max-width: 460px;
}
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.primary { background: var(--accent-color, #0078d7); color: #fff; }
</style>
