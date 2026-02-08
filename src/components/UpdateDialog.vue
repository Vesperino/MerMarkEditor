<script setup lang="ts">
import { useI18n } from '../i18n';

const { t } = useI18n();

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
        <h3>{{ t.updateAvailable }}</h3>
      </div>
      <div class="dialog-content">
        <p>{{ t.newVersionAvailable }} <strong>{{ version }}</strong></p>
        <div v-if="notes" class="update-notes">
          <p>{{ notes }}</p>
        </div>
        <div v-if="isUpdating" class="update-progress">
          <p>{{ t.downloadingUpdate }}</p>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
        </div>
        <p v-if="error" class="update-error">{{ error }}</p>
      </div>
      <div class="dialog-actions">
        <button @click="emit('close')" class="btn-cancel" :disabled="isUpdating">{{ t.later }}</button>
        <button @click="emit('update')" class="btn-confirm" :disabled="isUpdating">
          {{ isUpdating ? t.updating : t.updateNow }}
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

.btn-cancel:hover:not(:disabled) {
  background: var(--border-secondary);
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
  background: var(--primary);
  color: white;
  border: none;
  transition: all 0.2s;
}

.btn-confirm:hover:not(:disabled) {
  background: var(--primary-hover);
}

.update-notes {
  background: var(--dialog-actions-bg);
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-secondary);
  max-height: 150px;
  overflow-y: auto;
}

.update-progress {
  margin-top: 16px;
}

.progress-bar {
  height: 8px;
  background: var(--progress-bg);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  background: var(--progress-fill);
  transition: width 0.3s ease;
}

.update-error {
  color: var(--error-color);
  margin-top: 12px;
  font-size: 13px;
}
</style>
