<script setup lang="ts">
import { useI18n } from '../../i18n';

defineProps<{ tool: string; args: unknown }>();
const emit = defineEmits<{ allow: []; deny: [] }>();
const { t } = useI18n();
</script>

<template>
  <div class="modal-overlay">
    <div class="modal">
      <h3>{{ t.aiToolConfirmTitle }}</h3>
      <p><strong>{{ tool }}</strong></p>
      <pre>{{ JSON.stringify(args, null, 2) }}</pre>
      <div class="actions">
        <button @click="emit('deny')">{{ t.aiToolConfirmDeny }}</button>
        <button @click="emit('allow')" class="primary">{{ t.aiToolConfirmAllow }}</button>
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
  max-width: 480px;
  max-height: 70vh;
  overflow: auto;
}
.modal pre {
  background: #f8fafc;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow: auto;
}
.actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
.primary { background: var(--accent-color, #0078d7); color: #fff; }
</style>
