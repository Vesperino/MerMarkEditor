<script setup lang="ts">
withDefaults(defineProps<{
  version: string;
  notes: string;
  progress?: number;
  isUpdating?: boolean;
  error?: string | null;
}>(), {
  progress: 0,
  isUpdating: false,
  error: null,
});

const emit = defineEmits<{
  close: [];
  update: [];
}>();
</script>

<template>
  <div class="dialog-overlay" @click.self="!isUpdating && emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>Dostępna aktualizacja</h3>
      </div>
      <div class="dialog-content">
        <p>Dostępna jest nowa wersja: <strong>{{ version }}</strong></p>
        <div v-if="notes" class="update-notes">
          <p>{{ notes }}</p>
        </div>
        <div v-if="isUpdating" class="update-progress">
          <p>Pobieranie aktualizacji...</p>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
        </div>
        <p v-if="error" class="update-error">{{ error }}</p>
      </div>
      <div class="dialog-actions">
        <button @click="emit('close')" class="btn-cancel" :disabled="isUpdating">Później</button>
        <button @click="emit('update')" class="btn-confirm" :disabled="isUpdating">
          {{ isUpdating ? 'Aktualizowanie...' : 'Aktualizuj teraz' }}
        </button>
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

.btn-cancel:hover:not(:disabled) {
  background: #cbd5e1;
}

.btn-cancel:disabled,
.btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.btn-confirm:hover:not(:disabled) {
  background: #1d4ed8;
}

.update-notes {
  background: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  font-size: 13px;
  color: #475569;
  max-height: 150px;
  overflow-y: auto;
}

.update-progress {
  margin-top: 16px;
}

.progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  background: #2563eb;
  transition: width 0.3s ease;
}

.update-error {
  color: #dc2626;
  margin-top: 12px;
  font-size: 13px;
}
</style>
