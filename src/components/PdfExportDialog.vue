<template>
  <div class="pdf-overlay" @keydown.esc="$emit('close')">
    <div class="pdf-sidebar">
      <h3 class="pdf-title">Podgląd PDF</h3>

      <div class="pdf-settings">
        <label class="pdf-label">
          Rozmiar czcionki
          <select v-model="settings.fontSize" class="pdf-select" data-testid="pdf-font-size">
            <option value="8pt">XS — 8pt</option>
            <option value="9pt">S — 9pt</option>
            <option value="10pt">M — 10pt</option>
            <option value="11pt">L — 11pt</option>
            <option value="12pt">XL — 12pt</option>
          </select>
        </label>

        <label class="pdf-label">
          Marginesy
          <select v-model="settings.margins" class="pdf-select" data-testid="pdf-margins">
            <option value="narrow">Wąskie — 10mm</option>
            <option value="normal">Normalne — 18mm</option>
            <option value="wide">Szerokie — 25mm</option>
          </select>
        </label>

        <label class="pdf-label">
          Format strony
          <select v-model="settings.pageSize" class="pdf-select" data-testid="pdf-page-size">
            <option value="A4">A4</option>
            <option value="Letter">Letter (US)</option>
            <option value="A3">A3</option>
          </select>
        </label>
      </div>

      <div class="pdf-actions">
        <button class="pdf-btn pdf-btn--secondary" @click="$emit('close')">Zamknij</button>
        <button class="pdf-btn pdf-btn--primary" data-testid="pdf-confirm" @click="handlePrint">
          Drukuj / PDF
        </button>
      </div>
    </div>

    <div class="pdf-preview-area">
      <iframe
        ref="previewFrame"
        class="pdf-preview-frame"
        :srcdoc="srcdoc"
        sandbox="allow-scripts allow-same-origin allow-modals"
        @load="onIframeLoad"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import printCssRaw from '../styles/print.css?raw';
import {
  loadPdfSettings,
  savePdfSettings,
  buildPrintDocument,
  type PdfSettings,
} from '../composables/usePdfExport';

const props = defineProps<{ contentHtml: string }>();
const emit = defineEmits<{ close: [] }>();

const previewFrame = ref<HTMLIFrameElement | null>(null);
const settings = reactive<PdfSettings>(loadPdfSettings());

const srcdoc = computed(() =>
  buildPrintDocument(props.contentHtml, settings, printCssRaw),
);

function onIframeLoad() {
  const frame = previewFrame.value;
  if (!frame) return;
  try {
    const body = frame.contentDocument?.body;
    if (body) {
      frame.style.height = body.scrollHeight + 48 + 'px';
    }
  } catch {}
}

function handlePrint() {
  savePdfSettings({ ...settings });
  previewFrame.value?.contentWindow?.print();
}
</script>

<style scoped>
.pdf-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  background: #3a3a3a;
}

.pdf-sidebar {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--bg-primary, #ffffff);
  border-right: 1px solid var(--border-primary, #d8dde2);
  padding: 20px 16px;
  overflow-y: auto;
}

.pdf-title {
  margin: 0 0 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.pdf-settings {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.pdf-label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary, #303030);
}

.pdf-select {
  padding: 6px 8px;
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 5px;
  background: var(--bg-input, #ffffff);
  color: var(--text-primary, #1a1a1a);
  font-size: 12px;
  cursor: pointer;
}

.pdf-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 24px;
}

.pdf-btn {
  padding: 8px 12px;
  border-radius: 5px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  text-align: center;
}

.pdf-btn--secondary {
  background: var(--bg-tertiary, #f4f6f8);
  color: var(--text-secondary, #303030);
}

.pdf-btn--primary {
  background: #14b8a6;
  color: #ffffff;
}

.pdf-btn--primary:hover { background: #0d9488; }
.pdf-btn--secondary:hover { background: var(--border-primary, #d8dde2); }

.pdf-preview-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  gap: 0;
  background: #505050;
}

.pdf-preview-frame {
  width: 210mm;
  min-height: 297mm;
  border: none;
  box-shadow: 0 4px 32px rgba(0, 0, 0, 0.5);
  background: #ffffff;
  display: block;
}
</style>
