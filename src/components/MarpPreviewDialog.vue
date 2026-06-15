<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { t } from '../i18n';
import { renderDeck, buildStandaloneHtml, splitSlides, useMarpExport } from '../composables/useMarpExport';

const props = defineProps<{
  markdown: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { exportMarp } = useMarpExport();

const current = ref(0);
const previewFrame = ref<HTMLIFrameElement | null>(null);

const deck = computed(() => renderDeck(props.markdown));
const srcdoc = computed(() => buildStandaloneHtml(deck.value, props.title));
const slideCount = computed(() => Math.max(1, splitSlides(props.markdown).length));

function showSlide(index: number) {
  const doc = previewFrame.value?.contentDocument;
  if (!doc) return;
  const sections = Array.from(doc.querySelectorAll<HTMLElement>('section'));
  const clamped = Math.max(0, Math.min(index, slideCount.value - 1));
  current.value = clamped;
  sections.forEach((s, i) => {
    const el = (s.closest('svg[data-marpit-svg]') as HTMLElement) ?? s;
    el.style.display = i === clamped ? '' : 'none';
  });
}

function onFrameLoad() {
  current.value = 0;
  showSlide(0);
}

function prev() {
  if (current.value > 0) showSlide(current.value - 1);
}

function next() {
  if (current.value < slideCount.value - 1) showSlide(current.value + 1);
}

async function onExport() {
  await exportMarp(props.markdown, props.title);
}

watch(srcdoc, () => {
  current.value = 0;
});
</script>

<template>
  <div class="marp-overlay" @click.self="emit('close')">
    <div class="marp-dialog">
      <header class="marp-header">
        <h3 class="marp-title">{{ t.marpPreviewTitle }}</h3>
        <button class="marp-close" :aria-label="t.close" @click="emit('close')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div class="marp-stage">
        <iframe
          ref="previewFrame"
          class="marp-frame"
          :srcdoc="srcdoc"
          sandbox="allow-same-origin"
          @load="onFrameLoad"
        ></iframe>
      </div>

      <footer class="marp-footer">
        <div class="marp-nav">
          <button class="marp-btn" :disabled="current === 0" v-tooltip="t.marpPrevSlide" @click="prev">‹</button>
          <span class="marp-counter">{{ t.marpSlideCounter(current + 1, slideCount) }}</span>
          <button class="marp-btn" :disabled="current >= slideCount - 1" v-tooltip="t.marpNextSlide" @click="next">›</button>
        </div>
        <div class="marp-actions">
          <button class="marp-btn marp-btn--ghost" @click="emit('close')">{{ t.pdfBtnClose }}</button>
          <button class="marp-btn marp-btn--primary" @click="onExport">{{ t.marpExportHtml }}</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.marp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.marp-dialog {
  display: flex;
  flex-direction: column;
  width: min(960px, 92vw);
  height: min(720px, 90vh);
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: var(--shadow-dropdown);
  overflow: hidden;
}

.marp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
}

.marp-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.marp-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.marp-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.marp-stage {
  flex: 1;
  min-height: 0;
  background: var(--bg-secondary, #1a1a1a);
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  padding: 16px;
}

.marp-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
  border-radius: 6px;
}

.marp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
  gap: 12px;
}

.marp-nav {
  display: flex;
  align-items: center;
  gap: 10px;
}

.marp-counter {
  font-size: 13px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 70px;
  text-align: center;
}

.marp-actions {
  display: flex;
  gap: 8px;
}

.marp-btn {
  padding: 6px 14px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.marp-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text-primary);
}
.marp-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.marp-btn--ghost {
  background: transparent;
}

.marp-btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.marp-btn--primary:hover {
  filter: brightness(1.05);
}
</style>
