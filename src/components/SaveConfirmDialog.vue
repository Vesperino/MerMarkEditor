<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();

defineProps<{
  fileName: string;
  currentIndex: number;
  totalCount: number;
}>();

const emit = defineEmits<{
  save: [];
  discard: [];
  cancel: [];
}>();
</script>

<template>
  <div class="dialog-overlay">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ t.unsavedChanges }}</h3>
        <span v-if="totalCount > 1" class="counter">({{ currentIndex }}/{{ totalCount }})</span>
      </div>
      <div class="dialog-content">
        <p>{{ t.fileHasUnsavedChanges(fileName) }}</p>
        <p>{{ t.saveBeforeClosing }}</p>
      </div>
      <div class="dialog-actions">
        <button @click="emit('discard')" class="btn-discard">{{ t.discard }}</button>
        <button @click="emit('cancel')" class="btn-cancel">{{ t.cancel }}</button>
        <button @click="emit('save')" class="btn-save">{{ t.save }}</button>
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
  z-index: 10001;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.counter {
  color: #64748b;
  font-size: 14px;
}

.dialog-content {
  padding: 20px;
}

.dialog-content p {
  margin: 0 0 8px 0;
  color: #475569;
}

.dialog-content p:last-child {
  margin-bottom: 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.btn-discard {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #fee2e2;
  color: #dc2626;
  border: none;
  transition: all 0.2s;
}

.btn-discard:hover {
  background: #fecaca;
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

.btn-save {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #2563eb;
  color: white;
  border: none;
  transition: all 0.2s;
}

.btn-save:hover {
  background: #1d4ed8;
}
</style>
