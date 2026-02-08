<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();

defineProps<{
  url: string;
}>();

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>

<template>
  <div class="dialog-overlay" @click.self="emit('cancel')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ t.openExternalLink }}</h3>
      </div>
      <div class="dialog-content">
        <p>{{ t.confirmNavigateTo }}</p>
        <p class="dialog-url">{{ url }}</p>
      </div>
      <div class="dialog-actions">
        <button @click="emit('cancel')" class="btn-cancel">{{ t.cancel }}</button>
        <button @click="emit('confirm')" class="btn-confirm">{{ t.openLink }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 20px 60px var(--shadow-lg);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-primary);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.dialog-content {
  padding: 20px;
}

.dialog-content p {
  margin: 0 0 8px 0;
  color: var(--text-secondary);
}

.dialog-url {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  background: var(--bg-tertiary);
  padding: 12px;
  border-radius: 6px;
  word-break: break-all;
  color: var(--link-color);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-primary);
  background: var(--dialog-actions-bg);
}

.btn-cancel {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: var(--border-primary);
  color: var(--text-secondary);
  border: none;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: var(--border-secondary);
}

.btn-confirm {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: var(--primary);
  color: white;
  border: none;
  transition: all 0.2s;
}

.btn-confirm:hover {
  background: var(--primary-hover);
}
</style>
