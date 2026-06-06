<template>
  <div class="pdf-overlay">
    <div class="pdf-sidebar">
      <div class="pdf-sidebar-header">
        <h3 class="pdf-title">{{ t.pdfPreviewTitle }}</h3>
        <select
          v-model="selectedPresetId"
          class="pdf-select pdf-preset-select"
          data-testid="pdf-preset-select"
          @change="applyPreset"
        >
          <option value="">{{ t.pdfNoPreset }}</option>
          <optgroup :label="t.pdfBuiltinPresets">
            <option v-for="p in builtinPresets" :key="p.id" :value="p.id">{{ p.name }}</option>
          </optgroup>
          <optgroup v-if="customPresetsList.length" :label="t.pdfCustomPresets">
            <option v-for="p in customPresetsList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </optgroup>
        </select>
        <div class="pdf-preset-actions">
          <button class="pdf-mini-btn" data-testid="pdf-save-preset" @click="openSavePreset">{{ t.pdfSavePreset }}</button>
          <button
            v-if="selectedPresetId && !isBuiltin(selectedPresetId)"
            class="pdf-mini-btn pdf-mini-btn--danger"
            @click="deletePresetById(selectedPresetId)"
          >
            {{ t.pdfDeletePreset }}
          </button>
        </div>
      </div>

      <div class="pdf-tabs">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="pdf-tab"
          :class="{ 'pdf-tab--active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="pdf-tab-body">
        <div v-if="activeTab === 'layout'" class="pdf-fields">
          <label class="pdf-label">
            {{ t.pdfFontSize }}
            <select v-model="settings.fontSize" class="pdf-select" data-testid="pdf-font-size">
              <option value="8pt">{{ t.pdfFontSizeXs }}</option>
              <option value="9pt">{{ t.pdfFontSizeS }}</option>
              <option value="10pt">{{ t.pdfFontSizeM }}</option>
              <option value="11pt">{{ t.pdfFontSizeL }}</option>
              <option value="12pt">{{ t.pdfFontSizeXl }}</option>
            </select>
          </label>
          <label class="pdf-label">
            {{ t.pdfMarginPreset }}
            <select v-model="settings.margins" class="pdf-select" data-testid="pdf-margins" @change="onMarginPresetChange">
              <option value="narrow">{{ t.pdfMarginNarrow }}</option>
              <option value="normal">{{ t.pdfMarginNormal }}</option>
              <option value="wide">{{ t.pdfMarginWide }}</option>
              <option value="custom">{{ t.pdfMarginCustom }}</option>
            </select>
          </label>
          <div class="pdf-margin-grid">
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfMarginTop }} ({{ effectiveMargins.top }} mm)
              <input
                :value="effectiveMargins.top"
                type="range"
                min="3"
                max="60"
                step="1"
                data-testid="pdf-margin-top"
                @input="onMarginSide('top', $event)"
              >
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfMarginRight }} ({{ effectiveMargins.right }} mm)
              <input
                :value="effectiveMargins.right"
                type="range"
                min="3"
                max="60"
                step="1"
                data-testid="pdf-margin-right"
                @input="onMarginSide('right', $event)"
              >
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfMarginBottom }} ({{ effectiveMargins.bottom }} mm)
              <input
                :value="effectiveMargins.bottom"
                type="range"
                min="3"
                max="60"
                step="1"
                data-testid="pdf-margin-bottom"
                @input="onMarginSide('bottom', $event)"
              >
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfMarginLeft }} ({{ effectiveMargins.left }} mm)
              <input
                :value="effectiveMargins.left"
                type="range"
                min="3"
                max="60"
                step="1"
                data-testid="pdf-margin-left"
                @input="onMarginSide('left', $event)"
              >
            </label>
          </div>
          <label class="pdf-label">
            {{ t.pdfPageSize }}
            <select v-model="settings.pageSize" class="pdf-select" data-testid="pdf-page-size">
              <option value="A4">A4</option>
              <option value="Letter">Letter (US)</option>
              <option value="A3">A3</option>
            </select>
          </label>
        </div>

        <div v-if="activeTab === 'typography'" class="pdf-fields">
          <label class="pdf-label">
            {{ t.pdfBodyFont }}
            <select
              v-model="settings.fontFamily"
              class="pdf-select pdf-font-select"
              :style="{ fontFamily: currentBodyStack }"
              data-testid="pdf-font-family"
            >
              <optgroup :label="t.pdfFontGroupSerif">
                <option v-for="f in serifFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
              <optgroup :label="t.pdfFontGroupSans">
                <option v-for="f in sansFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
              <optgroup :label="t.pdfFontGroupMono">
                <option v-for="f in monoFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
            </select>
            <div class="pdf-font-sample" :style="{ fontFamily: currentBodyStack }">
              {{ t.pdfFontSampleBody }}
            </div>
          </label>
          <label class="pdf-label">
            {{ t.pdfHeadingFont }}
            <select
              v-model="settings.headingFontFamily"
              class="pdf-select pdf-font-select"
              :style="{ fontFamily: currentHeadingStack }"
            >
              <optgroup :label="t.pdfFontGroupSerif">
                <option v-for="f in serifFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
              <optgroup :label="t.pdfFontGroupSans">
                <option v-for="f in sansFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
              <optgroup :label="t.pdfFontGroupMono">
                <option v-for="f in monoFonts" :key="f.id" :value="f.id" :style="{ fontFamily: f.stack }">{{ f.label }}</option>
              </optgroup>
            </select>
            <div class="pdf-font-sample" :style="{ fontFamily: currentHeadingStack, fontWeight: 600 }">
              {{ t.pdfFontSampleHeading }}
            </div>
          </label>
          <label class="pdf-label">
            {{ t.pdfAccentColor }}
            <input v-model="settings.accentColor" type="color" class="pdf-color" data-testid="pdf-accent">
          </label>
          <label class="pdf-label">
            {{ t.pdfTableHeaderBg }}
            <input v-model="settings.tableHeaderBg" type="color" class="pdf-color">
          </label>
        </div>

        <div v-if="activeTab === 'header'" class="pdf-fields">
          <label class="pdf-checkbox-row">
            <input v-model="settings.header.enabled" type="checkbox" data-testid="pdf-header-enabled">
            <span>{{ t.pdfHeaderEnabled }}</span>
          </label>
          <div v-if="settings.header.enabled" class="pdf-three-col">
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionLeft }}
              <input v-model="settings.header.left" type="text" class="pdf-input" placeholder="{title}">
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionCenter }}
              <input v-model="settings.header.center" type="text" class="pdf-input">
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionRight }}
              <input v-model="settings.header.right" type="text" class="pdf-input" placeholder="{date}">
            </label>
          </div>

          <label class="pdf-checkbox-row">
            <input v-model="settings.footer.enabled" type="checkbox" data-testid="pdf-footer-enabled">
            <span>{{ t.pdfFooterEnabled }}</span>
          </label>
          <div v-if="settings.footer.enabled" class="pdf-three-col">
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionLeft }}
              <input v-model="settings.footer.left" type="text" class="pdf-input" placeholder="{path}">
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionCenter }}
              <input v-model="settings.footer.center" type="text" class="pdf-input">
            </label>
            <label class="pdf-label pdf-label--sm">
              {{ t.pdfPositionRight }}
              <input v-model="settings.footer.right" type="text" class="pdf-input" placeholder="{page}/{pages}">
            </label>
          </div>

          <p class="pdf-hint">
            {{ t.pdfTemplateVars }} <code>{{ '{title}' }}</code> <code>{{ '{date}' }}</code> <code>{{ '{path}' }}</code>
            <code>{{ '{page}' }}</code> <code>{{ '{pages}' }}</code>
          </p>

          <label class="pdf-checkbox-row">
            <input v-model="settings.showPageNumbers" type="checkbox">
            <span>{{ t.pdfShowPageNumbers }}</span>
          </label>
          <label v-if="settings.showPageNumbers" class="pdf-label">
            {{ t.pdfPageNumberFormat }}
            <select v-model="settings.pageNumberFormat" class="pdf-select">
              <option value="n">{{ t.pdfPageNumberFormatN }}</option>
              <option value="n-of-total">{{ t.pdfPageNumberFormatNOfTotal }}</option>
              <option value="page-n-of-total">{{ t.pdfPageNumberFormatPageNOfTotal }}</option>
            </select>
          </label>
          <label class="pdf-label">
            {{ t.pdfStartPageNumber }}
            <input v-model.number="settings.startPageNumber" type="number" min="1" class="pdf-input">
          </label>
        </div>

        <div v-if="activeTab === 'toc'" class="pdf-fields">
          <label class="pdf-checkbox-row">
            <input v-model="settings.showToc" type="checkbox" data-testid="pdf-show-toc">
            <span>{{ t.pdfShowToc }}</span>
          </label>
          <label v-if="settings.showToc" class="pdf-label">
            {{ t.pdfTocDepth }}
            <select v-model.number="settings.tocDepth" class="pdf-select" data-testid="pdf-toc-depth">
              <option :value="1">H1</option>
              <option :value="2">H1–H2</option>
              <option :value="3">H1–H3</option>
              <option :value="4">H1–H4</option>
              <option :value="5">H1–H5</option>
              <option :value="6">H1–H6</option>
            </select>
          </label>
          <label v-if="settings.showToc" class="pdf-checkbox-row">
            <input v-model="settings.tocPageBreak" type="checkbox" data-testid="pdf-toc-page-break">
            <span>{{ t.pdfTocPageBreak }}</span>
          </label>
        </div>

        <div v-if="activeTab === 'watermark'" class="pdf-fields">
          <label class="pdf-checkbox-row">
            <input v-model="settings.watermark.enabled" type="checkbox" data-testid="pdf-watermark-enabled">
            <span>{{ t.pdfWatermarkEnabled }}</span>
          </label>
          <template v-if="settings.watermark.enabled">
            <label class="pdf-label">
              {{ t.pdfWatermarkText }}
              <input v-model="settings.watermark.text" type="text" class="pdf-input">
            </label>
            <label class="pdf-label">
              {{ t.pdfWatermarkColor }}
              <input v-model="settings.watermark.color" type="color" class="pdf-color">
            </label>
            <label class="pdf-label">
              {{ t.pdfWatermarkOpacity(Math.round(settings.watermark.opacity * 100)) }}
              <input v-model.number="settings.watermark.opacity" type="range" min="0.02" max="0.5" step="0.01">
            </label>
            <label class="pdf-label">
              {{ t.pdfWatermarkRotate(settings.watermark.rotate) }}
              <input v-model.number="settings.watermark.rotate" type="range" min="-90" max="90" step="5">
            </label>
            <label class="pdf-label">
              {{ t.pdfWatermarkSize }}
              <input v-model="settings.watermark.size" type="text" class="pdf-input" placeholder="120pt">
            </label>
          </template>
        </div>
      </div>

      <div class="pdf-actions">
        <button class="pdf-btn pdf-btn--secondary" data-testid="pdf-close" @click="$emit('close')">{{ t.pdfBtnClose }}</button>
        <button class="pdf-btn pdf-btn--primary" data-testid="pdf-confirm" @click="handlePrint">
          {{ t.pdfBtnPrint }}
        </button>
      </div>
    </div>

    <div class="pdf-preview-area">
      <iframe
        ref="previewFrame"
        class="pdf-preview-frame"
        sandbox="allow-scripts allow-same-origin allow-modals"
      />
    </div>

    <div v-if="showSavePresetModal" class="pdf-mini-modal" @click.self="showSavePresetModal = false">
      <div class="pdf-mini-modal-body">
        <h4>{{ t.pdfSavePresetTitle }}</h4>
        <input v-model="newPresetName" type="text" class="pdf-input" :placeholder="t.pdfPresetNamePlaceholder">
        <div class="pdf-mini-modal-actions">
          <button class="pdf-btn pdf-btn--secondary" @click="showSavePresetModal = false">{{ t.pdfBtnCancel }}</button>
          <button class="pdf-btn pdf-btn--primary" data-testid="pdf-save-preset-confirm" @click="confirmSavePreset">{{ t.pdfBtnSave }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import printCssRaw from '../styles/print.css?raw';
import {
  loadPdfSettings,
  savePdfSettings,
  buildPrintDocument,
  SYSTEM_FONTS,
  getFontStack,
  type PdfSettings,
  type DocumentMeta,
} from '../composables/usePdfExport';
import { usePdfPresets, isBuiltinPreset } from '../composables/usePdfPresets';
import { t } from '../i18n';

const props = defineProps<{
  contentHtml: string;
  meta?: DocumentMeta;
}>();
defineEmits<{ close: [] }>();

const TABS = computed(() => [
  { id: 'layout' as const, label: t.value.pdfTabLayout },
  { id: 'typography' as const, label: t.value.pdfTabTypography },
  { id: 'header' as const, label: t.value.pdfTabHeader },
  { id: 'toc' as const, label: t.value.pdfTabToc },
  { id: 'watermark' as const, label: t.value.pdfTabWatermark },
]);
type TabId = 'layout' | 'typography' | 'header' | 'toc' | 'watermark';

const activeTab = ref<TabId>('layout');
const previewFrame = ref<HTMLIFrameElement | null>(null);
const settings = reactive<PdfSettings>(loadPdfSettings());

const serifFonts = computed(() => SYSTEM_FONTS.filter(f => f.category === 'serif'));
const sansFonts = computed(() => SYSTEM_FONTS.filter(f => f.category === 'sans'));
const monoFonts = computed(() => SYSTEM_FONTS.filter(f => f.category === 'mono'));

const currentBodyStack = computed(() => getFontStack(settings.fontFamily));
const currentHeadingStack = computed(() => getFontStack(settings.headingFontFamily));

const PRESET_MARGINS_FULL: Record<string, { top: number; right: number; bottom: number; left: number }> = {
  narrow: { top: 10, right: 10, bottom: 14, left: 10 },
  normal: { top: 18, right: 18, bottom: 22, left: 18 },
  wide:   { top: 25, right: 25, bottom: 28, left: 25 },
};

const effectiveMargins = computed(() => {
  if (settings.margins === 'custom') return settings.customMargins;
  return PRESET_MARGINS_FULL[settings.margins] ?? PRESET_MARGINS_FULL.normal;
});

function onMarginPresetChange() {
  if (settings.margins !== 'custom') {
    const preset = PRESET_MARGINS_FULL[settings.margins] ?? PRESET_MARGINS_FULL.normal;
    settings.customMargins = { ...preset };
    settings.customMarginMm = preset.top;
  }
}

function onMarginSide(side: 'top' | 'right' | 'bottom' | 'left', e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (!Number.isFinite(v)) return;
  // If currently on preset, copy preset to customMargins first
  if (settings.margins !== 'custom') {
    const preset = PRESET_MARGINS_FULL[settings.margins] ?? PRESET_MARGINS_FULL.normal;
    settings.customMargins = { ...preset };
    settings.margins = 'custom';
  }
  settings.customMargins[side] = v;
  settings.customMarginMm = v;
}

const { customPresets, allPresets, findPreset, savePreset, deletePreset } = usePdfPresets();
const builtinPresets = computed(() => allPresets().filter(p => isBuiltinPreset(p.id)));
const customPresetsList = computed(() => customPresets.value);
const selectedPresetId = ref('');
const showSavePresetModal = ref(false);
const newPresetName = ref('');

const isBuiltin = isBuiltinPreset;

const srcdoc = computed(() =>
  buildPrintDocument(props.contentHtml, settings, printCssRaw, props.meta ?? {}),
);

function applyPreset() {
  if (!selectedPresetId.value) return;
  const preset = findPreset(selectedPresetId.value);
  if (!preset) return;
  Object.assign(settings, preset.settings);
}

function openSavePreset() {
  newPresetName.value = '';
  showSavePresetModal.value = true;
}

function confirmSavePreset() {
  const name = newPresetName.value.trim();
  if (!name) return;
  const preset = savePreset(name, { ...settings });
  selectedPresetId.value = preset.id;
  showSavePresetModal.value = false;
}

function deletePresetById(id: string) {
  if (!confirm(t.value.pdfConfirmDeletePreset)) return;
  deletePreset(id);
  if (selectedPresetId.value === id) selectedPresetId.value = '';
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;

function writeIframeContent() {
  const frame = previewFrame.value;
  if (!frame) return;
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.open();
  doc.write(srcdoc.value);
  doc.close();
  // After write, sync height
  nextTick(() => {
    try {
      const body = doc.body;
      if (body) {
        frame.style.height = body.scrollHeight + 48 + 'px';
      }
    } catch {}
  });
}

watch(srcdoc, () => {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(writeIframeContent, 120);
});

onMounted(() => {
  writeIframeContent();
});

onBeforeUnmount(() => {
  if (writeTimer) clearTimeout(writeTimer);
});

const isMacOS = /Macintosh|Mac OS X/i.test(navigator.userAgent);

async function handlePrint() {
  savePdfSettings({ ...settings });
  // WKWebView (macOS) silently ignores print() on an iframe (#103), so there we
  // render + print a dedicated top-level webview. WebView2/WebKitGTK print the
  // preview iframe fine in-place — no extra window.
  if (isMacOS) {
    try {
      await invoke('print_document', { html: srcdoc.value });
    } catch (e) {
      console.error('print_document failed', e);
    }
  } else {
    previewFrame.value?.contentWindow?.print();
  }
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
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary, #ffffff);
  border-right: 1px solid var(--border-primary, #d8dde2);
  overflow: hidden;
}

.pdf-sidebar-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border-primary, #d8dde2);
}

.pdf-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
}

.pdf-preset-select { width: 100%; }

.pdf-preset-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.pdf-mini-btn {
  flex: 1;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--border-primary, #d8dde2);
  background: var(--bg-tertiary, #f4f6f8);
  color: var(--text-secondary, #303030);
}

.pdf-mini-btn:hover { background: var(--border-primary, #d8dde2); }

.pdf-mini-btn--danger {
  color: #dc2626;
  border-color: #dc2626;
}

.pdf-tabs {
  display: flex;
  border-bottom: 1px solid var(--border-primary, #d8dde2);
  background: var(--bg-tertiary, #f4f6f8);
}

.pdf-tab {
  flex: 1;
  padding: 8px 6px;
  font-size: 11px;
  font-weight: 500;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary, #303030);
}

.pdf-tab:hover { background: var(--hover-bg, rgba(0,0,0,0.05)); }

.pdf-tab--active {
  background: var(--bg-primary, #ffffff);
  border-bottom-color: #14b8a6;
  color: var(--text-primary, #1a1a1a);
}

.pdf-tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.pdf-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pdf-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #303030);
}

.pdf-label--sm { font-size: 11px; }

.pdf-select, .pdf-input {
  padding: 6px 8px;
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 5px;
  background: var(--bg-input, #ffffff);
  color: var(--text-primary, #1a1a1a);
  font-size: 12px;
  width: 100%;
  box-sizing: border-box;
}

.pdf-color {
  width: 100%;
  height: 28px;
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 5px;
  background: var(--bg-input, #ffffff);
  cursor: pointer;
  padding: 2px;
}

.pdf-font-select { font-size: 13px; }

.pdf-font-sample {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bg-tertiary, #f4f6f8);
  border: 1px solid var(--border-primary, #d8dde2);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.4;
}

.pdf-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
}

.pdf-three-col {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.pdf-margin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pdf-hint {
  font-size: 10px;
  color: var(--text-muted, #777);
  margin: 0;
  line-height: 1.6;
}

.pdf-hint code {
  background: var(--bg-tertiary, #f4f6f8);
  padding: 0 3px;
  border-radius: 2px;
  font-size: 10px;
}

.pdf-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary, #d8dde2);
}

.pdf-btn {
  flex: 1;
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

.pdf-mini-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9100;
}

.pdf-mini-modal-body {
  background: var(--bg-primary, #ffffff);
  padding: 20px;
  border-radius: 8px;
  width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pdf-mini-modal-body h4 {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
}

.pdf-mini-modal-actions {
  display: flex;
  gap: 8px;
}
</style>
