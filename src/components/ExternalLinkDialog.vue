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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.dialog-content {
  padding: 20px;
}

.dialog-content p {
  margin: 0 0 8px 0;
  color: #475569;
}

.dialog-url {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  background: #f1f5f9;
  padding: 12px;
  border-radius: 6px;
  word-break: break-all;
  color: #2563eb;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.btn-cancel {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #e2e8f0;
  color: #475569;
  border: none;
  transition: all 0.2s;
}

.btn-cancel:hover {
  background: #cbd5e1;
}

.btn-confirm {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #2563eb;
  color: white;
  border: none;
  transition: all 0.2s;
}

.btn-confirm:hover {
  background: #1d4ed8;
}
</style>
