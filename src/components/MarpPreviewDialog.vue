<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { t } from '../i18n';
import { renderDeck, buildStandaloneHtml, splitSlides, useMarpExport } from '../composables/useMarpExport';

const props = defineProps<{
  markdown: string;
  title: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { exportMarp } = useMarpExport();

const AUTOPLAY_MS = 4000;

const current = ref(0);
const previewFrame = ref<HTMLIFrameElement | null>(null);
const dialogEl = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);
const isPlaying = ref(false);
let autoplayTimer: ReturnType<typeof setInterval> | null = null;

const deck = computed(() => renderDeck(props.markdown));
const srcdoc = computed(() => buildStandaloneHtml(deck.value, props.title));
const fallbackCount = computed(() => Math.max(1, splitSlides(props.markdown).length));
const renderedCount = ref(fallbackCount.value);
const slideCount = computed(() => Math.max(1, renderedCount.value));

// One slide = one marp-rendered unit. marp-core wraps every slide in an
// <svg data-marpit-svg>; advanced backgrounds inject extra <section> layers, so
// counting <section> over-counts. Toggle the svg units instead.
function slideUnits(): HTMLElement[] {
  const doc = previewFrame.value?.contentDocument;
  if (!doc) return [];
  const svgs = Array.from(doc.querySelectorAll<HTMLElement>('svg[data-marpit-svg]'));
  return svgs.length > 0 ? svgs : Array.from(doc.querySelectorAll<HTMLElement>('section'));
}

function showSlide(index: number) {
  const units = slideUnits();
  if (units.length === 0) return;
  renderedCount.value = units.length;
  const clamped = Math.max(0, Math.min(index, units.length - 1));
  current.value = clamped;
  units.forEach((el, i) => {
    el.style.display = i === clamped ? '' : 'none';
  });
}

function onFrameLoad() {
  bindFrameEvents();
  showSlide(0);
}

function prev() {
  if (current.value > 0) showSlide(current.value - 1);
}

function next() {
  if (current.value < slideCount.value - 1) {
    showSlide(current.value + 1);
  } else if (isPlaying.value) {
    showSlide(0);
  }
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
  }
  isPlaying.value = false;
}

function toggleAutoplay() {
  if (isPlaying.value) {
    stopAutoplay();
    return;
  }
  isPlaying.value = true;
  autoplayTimer = setInterval(next, AUTOPLAY_MS);
}

async function enterFullscreen() {
  const el = dialogEl.value;
  if (el?.requestFullscreen) await el.requestFullscreen();
}

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await enterFullscreen();
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement;
}

function handleKey(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
    case ' ':
      e.preventDefault();
      next();
      break;
    case 'ArrowLeft':
    case 'PageUp':
      e.preventDefault();
      prev();
      break;
    case 'f':
    case 'F':
      e.preventDefault();
      toggleFullscreen();
      break;
    case 'Escape':
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        emit('close');
      }
      break;
  }
}

function handleFrameClick(e: MouseEvent) {
  if ((e.target as HTMLElement)?.closest('a')) return;
  next();
}

function bindFrameEvents() {
  const doc = previewFrame.value?.contentDocument;
  if (!doc) return;
  doc.addEventListener('keydown', handleKey);
  doc.addEventListener('click', handleFrameClick);
}

onMounted(() => {
  window.addEventListener('keydown', handleKey);
  document.addEventListener('fullscreenchange', onFullscreenChange);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKey);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  stopAutoplay();
});

async function onExport() {
  await exportMarp(props.markdown, props.title);
}

watch(srcdoc, () => {
  current.value = 0;
  renderedCount.value = fallbackCount.value;
});
</script>

<template>
  <div class="marp-overlay" @click.self="emit('close')">
    <div
      ref="dialogEl"
      class="marp-dialog"
      :class="{ 'marp-dialog--fullscreen': isFullscreen }"
    >
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
          <button class="marp-btn" :disabled="current >= slideCount - 1 && !isPlaying" v-tooltip="t.marpNextSlide" @click="next">›</button>
        </div>
        <div class="marp-actions">
          <button
            class="marp-btn"
            :class="{ 'marp-btn--primary': isPlaying }"
            v-tooltip="isPlaying ? t.marpPause : t.marpPlay"
            @click="toggleAutoplay"
          >{{ isPlaying ? '❚❚' : '▶' }}</button>
          <button class="marp-btn" v-tooltip="t.marpFullscreen" @click="toggleFullscreen">⛶</button>
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

.marp-dialog--fullscreen {
  width: 100vw;
  height: 100vh;
  border: none;
  border-radius: 0;
}

.marp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-primary);
}

.marp-dialog--fullscreen .marp-header {
  display: none;
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

.marp-dialog--fullscreen .marp-stage {
  padding: 0;
  background: #000;
}

.marp-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
  border-radius: 6px;
}

.marp-dialog--fullscreen .marp-frame {
  border-radius: 0;
}

.marp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-primary);
  gap: 12px;
}

.marp-dialog--fullscreen .marp-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  border-top: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.marp-dialog--fullscreen .marp-footer:hover {
  opacity: 1;
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
