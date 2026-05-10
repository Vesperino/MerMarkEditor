<template>
  <div class="pdf-dialog-overlay" @click.self="$emit('cancel')">
    <div class="pdf-dialog">
      <h3 class="pdf-dialog-title">Eksport PDF</h3>

      <div class="pdf-dialog-fields">
        <label class="pdf-dialog-label">
          Rozmiar czcionki
          <select
            v-model="settings.fontSize"
            data-testid="pdf-font-size"
            class="pdf-dialog-select"
          >
            <option value="8pt">XS — 8pt</option>
            <option value="9pt">S — 9pt</option>
            <option value="10pt">M — 10pt (domyślny)</option>
            <option value="11pt">L — 11pt</option>
            <option value="12pt">XL — 12pt</option>
          </select>
        </label>

        <label class="pdf-dialog-label">
          Marginesy
          <select
            v-model="settings.margins"
            data-testid="pdf-margins"
            class="pdf-dialog-select"
          >
            <option value="narrow">Wąskie — 10mm</option>
            <option value="normal">Normalne — 18mm (domyślne)</option>
            <option value="wide">Szerokie — 25mm</option>
          </select>
        </label>

        <label class="pdf-dialog-label">
          Format strony
          <select
            v-model="settings.pageSize"
            data-testid="pdf-page-size"
            class="pdf-dialog-select"
          >
            <option value="A4">A4 (domyślny)</option>
            <option value="Letter">Letter (US)</option>
            <option value="A3">A3</option>
          </select>
        </label>
      </div>

      <div class="pdf-dialog-actions">
        <button
          class="pdf-dialog-btn pdf-dialog-btn--secondary"
          data-testid="pdf-cancel"
          @click="$emit('cancel')"
        >
          Anuluj
        </button>
        <button
          class="pdf-dialog-btn pdf-dialog-btn--primary"
          data-testid="pdf-confirm"
          @click="handleConfirm"
        >
          Eksportuj PDF
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { loadPdfSettings, type PdfSettings } from '../composables/usePdfExport';

const emit = defineEmits<{
  confirm: [settings: PdfSettings];
  cancel: [];
}>();

const settings = reactive<PdfSettings>(loadPdfSettings());

function handleConfirm() {
  emit('confirm', { ...settings });
}
</script>

<style scoped>
.pdf-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9000;
}

.pdf-dialog {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 8px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
}

.pdf-dialog-title {
  margin: 0 0 18px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.pdf-dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 20px;
}

.pdf-dialog-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 13px;
  color: var(--text-secondary, #303030);
}

.pdf-dialog-select {
  padding: 6px 10px;
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 5px;
  background: var(--bg-input, #ffffff);
  color: var(--text-primary, #1a1a1a);
  font-size: 13px;
  cursor: pointer;
}

.pdf-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.pdf-dialog-btn {
  padding: 7px 16px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.pdf-dialog-btn--secondary {
  background: var(--bg-tertiary, #f4f6f8);
  color: var(--text-secondary, #303030);
}

.pdf-dialog-btn--primary {
  background: #14b8a6;
  color: #ffffff;
}

.pdf-dialog-btn--primary:hover { background: #0d9488; }
.pdf-dialog-btn--secondary:hover { background: var(--border-primary, #d8dde2); }
</style>
